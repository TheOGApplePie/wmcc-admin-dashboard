import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { runCampaignGeneration } from "@/features/socialCampaigns/generation/runCampaignGeneration";

import { withCronLogging } from "../_logging";

export async function GET(req: NextRequest) {
  return withCronLogging("generation", async (log) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      log.warn("unauthorized", { secretConfigured: Boolean(secret) });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createServiceClient();
    const cutoff = new Date().toISOString();
    let lastId: string | null = null;
    const summary = { campaigns: 0, failed: 0, skipped: 0, inserted: 0 };
    for (;;) {
      let query = supabase
        .from("social_campaigns")
        .select("id")
        .eq("status", "active")
        .eq("generation_enabled", true)
        .or(`next_generation_at.is.null,next_generation_at.lte.${cutoff}`)
        .order("id")
        .limit(50);
      if (lastId) query = query.gt("id", lastId);
      const { data: campaigns, error } = await query;
      if (error) {
        log.error("campaign_query_failed", { error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const campaign of campaigns ?? []) {
        summary.campaigns++;
        try {
          const result = await runCampaignGeneration(supabase, campaign.id);
          if (result.skipped) {
            summary.skipped++;
            log.warn("campaign_skipped", {
              campaignId: campaign.id,
              reason: result.skipped,
            });
          }
          summary.inserted += result.inserted ?? 0;
        } catch (generationError) {
          summary.failed++;
          log.error("campaign_failed", {
            campaignId: campaign.id,
            error:
              generationError instanceof Error
                ? generationError.message
                : String(generationError),
          });
        }
      }
      if (!campaigns || campaigns.length < 50) break;
      lastId = campaigns[campaigns.length - 1].id;
    }
    log.summary(summary);

    return NextResponse.json({ ok: summary.failed === 0, summary });
  });
}
