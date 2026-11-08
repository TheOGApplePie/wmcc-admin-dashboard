import { getInstagramConfig } from "@/features/socialCampaigns/instagram/config";
import { NextRequest, NextResponse } from "next/server";
import { checkInstagramHealth, InstagramHealthError } from "@/features/socialCampaigns/instagram/health";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { hasPerm, type MemberRole } from "@/features/team/permissions";
import { withCronLogging } from "../_logging";

async function notifyPublishers() {
  const db = createServiceClient();
  const { data, error } = await db.from("profiles").select("id,role,permission_overrides").eq("status", "active");
  if (error) throw new Error("Unable to find publishers for Instagram health notification.");
  const recipients = (data ?? []).filter(profile => hasPerm(profile.role as MemberRole, profile.permission_overrides, "social", "publish"));
  if (!recipients.length) return;
  const { error: insertError } = await db.from("notifications").insert(recipients.map(profile => ({
    user_id: profile.id, entity_type: "integration", entity_id: getInstagramConfig().accountId ?? "instagram", type: "instagram_connection_warning", title: "Instagram connection needs attention",
    body: "Instagram credential checks or renewal need attention. Review the instagram-health cron logs and the Meta dashboard.",
  })));
  if (insertError) throw new Error("Unable to save Instagram health notifications.");
}

export async function GET(req: NextRequest) {
  return withCronLogging("instagram-health", async log => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      log.warn("unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const result = await checkInstagramHealth();
      if (result.warning) {
        log.warn("instagram_health_warning", result);
        await notifyPublishers();
      }
      const summary = { refreshed: result.refreshed, expiresAt: result.expiresAt };
      log.summary(summary);
      return NextResponse.json({ ok: !result.warning, summary });
    } catch (error) {
      // Never log upstream payloads: refresh responses contain access tokens.
      log.error("instagram_health_failed", { reason: error instanceof InstagramHealthError ? error.message : "Check account access, publishing permission, long-lived token age/validity, encryption key, API version, and migration 037." });
      try { await notifyPublishers(); }
      catch { log.error("instagram_health_notification_failed"); }
      return NextResponse.json({ error: "Instagram health check or token refresh failed. Verify configuration and credentials in Meta." }, { status: 503 });
    }
  });
}
