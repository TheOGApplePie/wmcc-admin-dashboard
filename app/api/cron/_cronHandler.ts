import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { publishDelivery, type ClaimedDelivery } from "@/features/socialCampaigns/delivery/publishers";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function notifyTerminalFailure(delivery: ClaimedDelivery, error: string) {
  const supabase = createServiceClient();
  const { data: profiles } = await supabase.from("profiles").select("id, role, permission_overrides").eq("status", "active");
  const recipients = (profiles ?? []).filter((profile) =>
    profile.role === "board" || profile.role === "management" || profile.permission_overrides?.["social.send"] === true,
  );
  if (!recipients.length) return;
  await supabase.from("notifications").insert(recipients.map((profile) => ({
    user_id: profile.id,
    type: "social_delivery_failed",
    title: "Social post needs attention",
    body: `${delivery.platform} delivery failed after ${delivery.attempt_number} attempts: ${error}`,
    entity_type: "social_delivery",
    entity_id: delivery.delivery_id,
  })));
}

export async function runCronSlot(req: NextRequest, slot: string): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("claim_social_deliveries", { p_limit: 20 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const delivery of (data ?? []) as ClaimedDelivery[]) {
    const result = await publishDelivery(delivery);
    const { error: completionError } = await supabase.rpc("complete_social_delivery_attempt", {
      p_delivery_id: delivery.delivery_id,
      p_success: result.success,
      p_provider_post_id: result.providerId ?? null,
      p_external_url: result.externalUrl ?? null,
      p_error: result.error ?? null,
      p_retryable: result.retryable ?? false,
    });
    if (completionError) {
      results.push({ id: delivery.delivery_id, ok: false, error: completionError.message });
      continue;
    }
    const terminalFailure = !result.success && (!result.retryable || delivery.attempt_number >= 3);
    if (terminalFailure) await notifyTerminalFailure(delivery, result.error ?? "Unknown provider failure.");
    results.push({ id: delivery.delivery_id, platform: delivery.platform, ok: result.success, retrying: !result.success && !terminalFailure });
  }
  return NextResponse.json({ slot, claimed: results.length, results });
}
