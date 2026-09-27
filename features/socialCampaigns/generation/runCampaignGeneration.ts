import { DATABASE_PAGE_SIZE } from "@/features/events/constants";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  readOccurrences,
  ensureEventCoverage,
  type OccurrenceRow,
} from "@/features/events/server";
import {
  SOCIAL_TIME_ZONE,
  addCalendarDays,
  planProposalSlots,
  proposeEventSchedule,
  type OccupiedSlot,
} from "@/features/socialCampaigns/scheduling";

async function readExistingKeys(supabase: SupabaseClient, campaignId: string) {
  const keys = new Set<string>();
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("social_campaign_occurrences")
      .select("generation_key")
      .eq("campaign_id", campaignId)
      .order("id")
      .range(offset, offset + DATABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) keys.add(row.generation_key);
    if (!data || data.length < DATABASE_PAGE_SIZE) return keys;
  }
}

function resolveLaunch(
  campaign: {
    launch_occurrence_id: string | null;
    launch_occurrence_at: string | null;
    launch_decision_made: boolean;
  },
  occurrences: OccurrenceRow[],
  actualFirst: boolean,
  behavior?: "next" | "reminders_only",
) {
  if (campaign.launch_occurrence_id) return campaign.launch_occurrence_id;
  if (campaign.launch_occurrence_at) {
    const timestamp = Date.parse(campaign.launch_occurrence_at);
    const legacy = occurrences.find(
      (occurrence) => Date.parse(occurrence.start_at) === timestamp,
    );
    if (legacy) return legacy.id;
  }
  if (!campaign.launch_decision_made && (actualFirst || behavior === "next"))
    return occurrences[0]?.id ?? null;
  return null;
}

export async function runCampaignGeneration(
  supabase: SupabaseClient,
  campaignId: string,
  launchBehavior?: "next" | "reminders_only",
) {
  const { data: campaign, error: campaignError } = await supabase
    .from("social_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign)
    throw new Error(campaignError?.message ?? "Campaign not found.");
  if (
    !campaign.event_id ||
    !campaign.generation_enabled ||
    campaign.status !== "active"
  )
    return {
      skipped: "Activate the campaign before generating proposals.",
      inserted: 0,
      generatedThrough: campaign.generated_through as string | null,
      suppressed: 0,
    };
  if (campaign.needs_review)
    throw new Error(
      "Resolve the open campaign review before generating proposals.",
    );
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,title,publication_status,version")
    .eq("id", campaign.event_id)
    .single();
  if (eventError || !event)
    throw new Error(eventError?.message ?? "Linked event not found.");
  if (event.publication_status !== "published")
    throw new Error(
      "Publish the linked event before generating its campaign schedule.",
    );
  await ensureEventCoverage(supabase, event.id);
  const today = formatInTimeZone(new Date(), SOCIAL_TIME_ZONE, "yyyy-MM-dd");
  const coverageStart = campaign.generated_through
    ? addCalendarDays(campaign.generated_through, 1)
    : ([today, campaign.starts_on].filter(Boolean).sort().at(-1) as string);
  const coverageEnd = [
    addCalendarDays(coverageStart, campaign.generation_horizon_days - 1),
    campaign.ends_on,
  ]
    .filter(Boolean)
    .sort()[0] as string;
  if (coverageEnd < coverageStart)
    return {
      skipped: "Campaign coverage has reached its end date.",
      inserted: 0,
      generatedThrough: campaign.generated_through as string | null,
      suppressed: 0,
    };
  // All finite sessions are available; slot planning only uses the current horizon.
  const occurrences = (
    await readOccurrences(supabase, new Date().toISOString(), null, event.id)
  ).filter((o) => Date.parse(o.start_at) > Date.now());
  const { data: first, error: firstError } = await supabase
    .from("resolved_event_occurrences")
    .select("id,start_at")
    .eq("event_id", event.id)
    .eq("cancelled", false)
    .eq("superseded", false)
    .eq("schedule_cancelled", false)
    .order("start_at")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (firstError) throw new Error(firstError.message);
  const next = occurrences[0];
  const actualFirst = Boolean(next && first?.id === next.id);
  if (!campaign.launch_decision_made && next && !actualFirst && !launchBehavior)
    return {
      skipped: "Choose launch treatment for the next session.",
      inserted: 0,
      generatedThrough: campaign.generated_through as string | null,
      suppressed: 0,
    };
  const { error: linkError } = await createServiceClient().rpc(
    "link_legacy_event_campaign_occurrences",
    { p_event_id: event.id },
  );
  if (linkError) throw new Error(linkError.message);
  const existingKeys = await readExistingKeys(supabase, campaignId);
  const launch = resolveLaunch(
    campaign,
    occurrences,
    actualFirst,
    launchBehavior,
  );
  const raw = occurrences
    .flatMap((occurrence) =>
      proposeEventSchedule({
        campaignId,
        campaignCreatedOn:
          campaign.starts_on ??
          formatInTimeZone(campaign.created_at, SOCIAL_TIME_ZONE, "yyyy-MM-dd"),
        eventOccurrenceAt: occurrence.start_at,
        today,
        isFirstOccurrence: occurrence.id === launch,
      }).map((proposal) => ({
        ...proposal,
        generationKey: `${campaignId}:${occurrence.id}:${proposal.milestone}`,
        eventOccurrenceId: occurrence.id,
      })),
    )
    .filter(
      (proposal) =>
        !existingKeys.has(proposal.generationKey) &&
        proposal.targetDate >= coverageStart &&
        proposal.targetDate <= coverageEnd,
    );
  const { data: occupiedRows, error: occupiedError } = await supabase
    .from("social_deliveries")
    .select("schedule_platform,scheduled_date,time_slot,status,retryable")
    .in("status", [
      "proposed",
      "scheduled",
      "due",
      "processing",
      "provider_processing",
      "failed",
    ])
    .gte("scheduled_date", today)
    .lte("scheduled_date", coverageEnd);
  if (occupiedError) throw new Error(occupiedError.message);
  const occupied = (occupiedRows ?? [])
    .filter((row) => row.status !== "failed" || row.retryable)
    .map((row) => ({
      schedulePlatform: row.schedule_platform,
      date: row.scheduled_date,
      slot: row.time_slot,
    })) as OccupiedSlot[];
  const { planned, suppressed } = planProposalSlots(raw, occupied, today);
  const proposals = planned.map((proposal, sequence) => {
    const source = raw.find(
      (item) => item.generationKey === proposal.generationKey,
    )!;
    const occurrence = occurrences.find(
      (item) => item.id === source.eventOccurrenceId,
    )!;
    return {
      ...proposal,
      eventOccurrenceId: occurrence.id,
      sequence,
      title: `${proposal.kind === "initial" ? "Initial post" : `${proposal.milestoneDays}-day reminder`}: ${event.title}`,
      caption: occurrence.description,
      description: occurrence.description,
      mediaUrl: occurrence.poster_url,
      callToActionLink: occurrence.call_to_action_link,
      callToActionCaption: occurrence.call_to_action_caption,
    };
  });
  const { data: inserted, error: persistError } = await supabase.rpc(
    "persist_event_campaign_proposals",
    {
      p_campaign_id: campaignId,
      p_event_version: event.version,
      p_proposals: proposals,
      p_suppressed: suppressed,
      p_generated_through: coverageEnd,
      p_launch_occurrence_id: launch,
      p_launch_decision_made: true,
    },
  );
  if (persistError) throw new Error(persistError.message);
  return {
    inserted: Number(inserted ?? 0),
    generatedThrough: coverageEnd,
    suppressed: suppressed.length,
  };
}
