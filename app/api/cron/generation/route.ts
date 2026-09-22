import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { runCampaignGeneration } from "@/features/socialCampaigns/generation/runCampaignGeneration";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServiceClient();
  const { data: campaigns, error } = await supabase.from("social_campaigns").select("id").eq("status", "active").eq("generation_enabled", true).or(`next_generation_at.is.null,next_generation_at.lte.${new Date().toISOString()}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const campaign of campaigns ?? []) {
    try { results.push({ id: campaign.id, ...(await runCampaignGeneration(supabase, campaign.id)) }); }
    catch (generationError) { results.push({ id: campaign.id, error: generationError instanceof Error ? generationError.message : String(generationError) }); }
  }
  return NextResponse.json({ campaigns: results.length, results });
}
