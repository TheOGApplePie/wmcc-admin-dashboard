import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { runCampaignGeneration } from "@/features/socialCampaigns/generation/runCampaignGeneration";

import { withCronLogging } from "../_logging";

export async function GET(req: NextRequest) {
  return withCronLogging("generation", async (log) => {
  const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      log.warn("unauthorized", { secretConfigured: Boolean(secret) }); return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  const supabase = createServiceClient();
  const { data: campaigns, error } = await supabase.from("social_campaigns").select("id").eq("status", "active").eq("generation_enabled", true).or(`next_generation_at.is.null,next_generation_at.lte.${new Date().toISOString()}`);
    if (error) {
      log.error("campaign_query_failed",{ error: error.message }); return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const results = [];
    for (const campaign of campaigns ?? []) {
      try {
        const result =(await runCampaignGeneration(supabase, campaign.id));
        results.push({ id: campaign.id, ...result });
        if (result.skipped)
          log.warn("campaign_skipped", {
            campaignId: campaign.id,
            reason: result.skipped,
          });

      } catch (generationError) {
        const message = generationError instanceof Error ? generationError.message : String(generationError);
        log.error("campaign_failed", {
          campaignId: campaign.id,
          error: message,
        });
        results.push({ id: campaign.id, error: message });
      }
    }
    const summary = { campaigns: results.length,
      failed: results.filter((result) => "error" in result).length,
      skipped: results.filter((result) => "skipped" in result).length,
      inserted: results.reduce(
        (total, result) => total + ("inserted" in result ? result.inserted : 0),
        0,
      ),
    };
    log.summary(summary);

    return NextResponse.json({ ok: summary.failed === 0, summary });
  });
}
