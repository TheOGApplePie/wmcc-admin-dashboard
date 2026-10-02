import { DATABASE_PAGE_SIZE } from "@/features/events/constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  readScheduleDates,
  type ScheduleDateRow,
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
      .from("social_posts")
      .select("source_schedule_id,source_date,reminder_milestone,channel")
      .eq("campaign_id", campaignId)
      .order("id")
      .range(offset, offset + DATABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) keys.add(`${campaignId}:${row.source_schedule_id}:${row.source_date}:${row.reminder_milestone}:${row.channel}`);
    if (!data || data.length < DATABASE_PAGE_SIZE) return keys;
  }
}

async function readOccupiedSlots(supabase: SupabaseClient, today: string, through: string) {
  const occupied: OccupiedSlot[] = [];
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase.from("social_posts")
      .select("schedule_platform,scheduled_date,time_slot,status,retryable")
      .in("status", ["proposed", "scheduled", "due", "processing", "provider_processing", "failed"])
      .gte("scheduled_date", today).lte("scheduled_date", through)
      .order("id").range(offset, offset + DATABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.status !== "failed" || row.retryable) occupied.push({
        schedulePlatform: row.schedule_platform, date: row.scheduled_date, slot: row.time_slot,
      } as OccupiedSlot);
    }
    if (!data || data.length < DATABASE_PAGE_SIZE) break;
  }
  return occupied;
}

function resolveLaunch(
  campaign: {
    launch_schedule_id: string | null;
    launch_occurrence_at: string | null;
    launch_decision_made: boolean;
  },
  occurrences: ScheduleDateRow[],
  actualFirst: boolean,
  behavior?: "next" | "reminders_only",
) {
  if (campaign.launch_occurrence_at) {
    const timestamp = Date.parse(campaign.launch_occurrence_at);
    const legacy = occurrences.find(
      (occurrence) =>
        occurrence.schedule_id === campaign.launch_schedule_id &&
        Date.parse(occurrence.start_at) === timestamp,
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
  // RRULE supplies dates directly from the event's current schedules.
  const through = fromZonedTime(`${addCalendarDays(coverageEnd, 15)}T00:00:00`, SOCIAL_TIME_ZONE).toISOString();
  const dates = await readScheduleDates(supabase, null, through, event.id, true);
  const occurrences = dates.filter(
    (date) => Date.parse(date.start_at) > Date.now(),
  );
  const first = dates[0];
  const next = occurrences[0];
  const actualFirst = Boolean(next && first?.id === next.id);
  if (!campaign.launch_decision_made && next && !actualFirst && !launchBehavior)
    return {
      skipped: "Choose launch treatment for the next session.",
      inserted: 0,
      generatedThrough: campaign.generated_through as string | null,
      suppressed: 0,
    };
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
        eventScheduleId: occurrence.schedule_id,
      })),
    )
    .map((proposal) => ({...proposal, channels: proposal.channels.filter((channel) => !existingKeys.has(`${proposal.generationKey}:${channel}`))}))
    .filter(
      (proposal) =>
        proposal.channels.length > 0 &&
        proposal.targetDate >= coverageStart &&
        proposal.targetDate <= coverageEnd,
    );
  const occupied = await readOccupiedSlots(supabase, today, coverageEnd);
  const { planned, suppressed } = planProposalSlots(raw, occupied, [today, campaign.starts_on].filter(Boolean).sort().at(-1) as string);
  const proposals = planned.map((proposal, sequence) => {
    const source = raw.find(
      (item) => item.generationKey === proposal.generationKey,
    )!;
    const occurrence = occurrences.find(
      (item) =>
        item.schedule_id === source.eventScheduleId &&
        item.start_at === source.eventOccurrenceAt,
    )!;
    return {
      ...proposal,
      eventScheduleId: occurrence.schedule_id,
      sourceDate: occurrence.original_key,
      sequence,
      title: `${proposal.kind === "initial" ? "Initial post" : `${proposal.milestoneDays}-day reminder`}: ${event.title}`,
      caption: occurrence.description,
      description: occurrence.description,
      mediaUrl: occurrence.poster_url,
      mediaAlt: occurrence.poster_alt,
      callToActionLink: occurrence.call_to_action_link,
      callToActionCaption: occurrence.call_to_action_caption,
    };
  });
  const { data: inserted, error: persistError } = await supabase.rpc(
    "persist_schedule_campaign_proposals",
    {
      p_campaign_id: campaignId,
      p_campaign_version: campaign.version,
      p_event_version: event.version,
      p_proposals: proposals,
      p_suppressed: suppressed,
      p_generated_through: coverageEnd,
      p_launch_schedule_id:
        occurrences.find((date) => date.id === launch)?.schedule_id ?? campaign.launch_schedule_id,
      p_launch_at:
        occurrences.find((date) => date.id === launch)?.start_at ??
        campaign.launch_occurrence_at,
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
