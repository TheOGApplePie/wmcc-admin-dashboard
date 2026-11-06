import { hasPerm, type MemberRole } from "@/features/team/permissions";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { publishDelivery, type ClaimedDelivery } from "@/features/socialCampaigns/delivery/publishers";

import { withCronLogging } from "./_logging";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

type FailedDelivery = Pick<ClaimedDelivery, "delivery_id" | "platform" | "attempt_number">;

async function notifyTerminalFailure(delivery: FailedDelivery, error: string) {
  const supabase = createServiceClient();
  const { data: profiles } = await supabase.from("profiles").select("id, role, permission_overrides").eq("status", "active");
  const recipients = (profiles ?? []).filter((profile) =>
    hasPerm(profile.role as MemberRole, profile.permission_overrides, "social", "publish"),
  );
  if (!recipients.length) return;
  await supabase.from("notifications").insert(recipients.map((profile) => ({
    user_id: profile.id,
    type: "social_delivery_failed",
    title: "Social post needs attention",
    body: `${delivery.platform} delivery failed after ${delivery.attempt_number} attempts: ${error}`,
    entity_type: "social_post",
    entity_id: delivery.delivery_id,
  })));
}

export async function runDeliveryCron(req: NextRequest): Promise<NextResponse> {
  return withCronLogging("delivery", async (log) => {
    if (!authorized(req)) {
      log.warn("unauthorized", {
        secretConfigured: Boolean( process.env.CRON_SECRET),
      }); return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (process.env.SOCIAL_DELIVERY_ENABLED !== "true") {
      log.summary({ bypassed: true });
      return NextResponse.json({ ok: true, summary: { bypassed: true } });
    }
  const supabase = createServiceClient();
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: recovered, error: recoveryError } = await supabase.rpc("recover_stuck_social_posts", {
    p_stale_before: staleBefore,
  });
    if (recoveryError) {
      log.error("recovery_failed",{ error: recoveryError.message }); return NextResponse.json({ error: recoveryError.message }, { status: 500 });
    }
  for (const delivery of recovered ?? []) {
    if (delivery.terminal) {
      await notifyTerminalFailure({
        delivery_id: delivery.delivery_id,
        platform: delivery.platform,
        attempt_number: delivery.attempt_number,
      }, "The publishing worker stopped before completing the final attempt.");
    }
  }
  const { data, error } = await supabase.rpc("claim_social_posts", { p_limit: 20 });
    if (error) {
      log.error("claim_failed",{ error: error.message }); return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = [];
    for (const delivery of (data ?? []) as ClaimedDelivery[]) {
      const context = {
        deliveryId: delivery.delivery_id,
        platform: delivery.platform,
        attempt: delivery.attempt_number,
      };
    const result = await publishDelivery(delivery);
      if (result.pending) {
      const { error: pendingError } = await supabase.rpc("mark_social_delivery_provider_processing", {
        p_delivery_id: delivery.delivery_id,
        p_provider_post_id: result.providerId ?? null,
        p_message: result.error ?? "Provider is processing the publication.",
      });
        if (pendingError)
          log.error("provider_state_save_failed", {
            ...context,
            error: pendingError.message,
          });
      results.push({
        id: delivery.delivery_id,
        platform: delivery.platform,
        ok: false,
        pending: !pendingError,
        error: pendingError?.message,
      });
        continue;
      }
    const { error: completionError } = await supabase.rpc("complete_social_delivery_attempt", {
      p_delivery_id: delivery.delivery_id,
      p_success: result.success,
      p_provider_post_id: result.providerId ?? null,
      p_external_url: result.externalUrl ?? null,
      p_error: result.error ?? null,
      p_retryable: result.retryable ?? false,
    });
      if (completionError) {
        log.error("completion_save_failed", {
          ...context, error: completionError.message,
        });
      results.push({ id: delivery.delivery_id, ok: false, error: completionError.message });
        continue;
      }
    const terminalFailure = !result.success && (!result.retryable || delivery.attempt_number >= 3);
      if (terminalFailure) log.error("delivery_failed", context);
      else if (!result.success) log.warn("delivery_retry_pending", context);
    if (terminalFailure) await notifyTerminalFailure(delivery, result.error ?? "Unknown provider failure.");
    results.push({ id: delivery.delivery_id, platform: delivery.platform, ok: result.success, retrying: !result.success && !terminalFailure });
    }
    const summary = { recovered: recovered?.length ?? 0, claimed: results.length,
      sent: results.filter((result) => result.ok).length,
      pending: results.filter((result) => "pending" in result && result.pending)
        .length,
      retrying: results.filter(
        (result) => "retrying" in result && result.retrying,
      ).length,
      failed: results.filter(
        (result) =>
          !result.ok &&
          !("pending" in result && result.pending) &&
          !("retrying" in result && result.retrying),
      ).length,
    };
    log.summary(summary);

    return NextResponse.json({ ok: summary.failed === 0, summary });
  });
}
