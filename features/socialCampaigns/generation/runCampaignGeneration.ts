import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import {
  SOCIAL_TIME_ZONE, addCalendarDays, availableSlots, expandCampaignOccurrences,
  nextCampaignOccurrence, proposeEventSchedule, schedulePlatformFor,
  type CampaignRecurrenceRule, type OccupiedSlot, type ScheduleProposal,
  type SocialChannel, type SocialTimeSlot,
} from "@/features/socialCampaigns/scheduling";

type GenerationEvent = {
  id: number; title: string; description: string; start_date: string; poster_url: string | null;
  call_to_action_link: string | null; call_to_action_caption: string | null; is_recurring: boolean;
  recurrence_rule: CampaignRecurrenceRule | CampaignRecurrenceRule[] | null;
};

export async function runCampaignGeneration(supabase: SupabaseClient, campaignId: string) {
  const { data: campaign, error: campaignError } = await supabase.from("social_campaigns").select("*").eq("id", campaignId).single();
  if (campaignError || !campaign) throw new Error(campaignError?.message ?? "Campaign not found.");
  if (!campaign.event_id || !campaign.generation_enabled || campaign.status !== "active") return { skipped: "Campaign is not eligible for automatic generation." };
  if (campaign.needs_review) return { skipped: "Campaign review must be resolved before generation." };
  const { data: eventData, error: eventError } = await supabase.from("events").select(`id, title, description, start_date, poster_url, call_to_action_link, call_to_action_caption, is_recurring, recurrence_rule(frequency, interval, by_weekdays, by_month_day, by_set_position, until, count, exdates)`).eq("id", campaign.event_id).single();
  if (eventError || !eventData) throw new Error(eventError?.message ?? "Linked event not found.");
  const event = eventData as unknown as GenerationEvent;
  const rule = Array.isArray(event.recurrence_rule) ? event.recurrence_rule[0] ?? null : event.recurrence_rule;
  if (event.is_recurring && !rule) throw new Error("The linked recurring event has no recurrence rule.");

  const today = formatInTimeZone(new Date(), SOCIAL_TIME_ZONE, "yyyy-MM-dd");
  const nextOccurrence = nextCampaignOccurrence(event.start_date, rule, today);
  if (!campaign.launch_decision_made && event.is_recurring && nextOccurrence && Date.parse(nextOccurrence) !== Date.parse(event.start_date)) {
    return { skipped: "Launch decision required." };
  }
  const coverageStart = campaign.generated_through ? addCalendarDays(campaign.generated_through, 1) : [today, campaign.starts_on].filter(Boolean).sort().at(-1) as string;
  const coverageEnd = addCalendarDays(coverageStart, campaign.generation_horizon_days - 1);
  const occurrenceThrough = addCalendarDays(coverageEnd, 21);
  let occurrences = expandCampaignOccurrences(event.start_date, rule, today, occurrenceThrough);
  if (nextOccurrence && !occurrences.includes(nextOccurrence)) occurrences = [nextOccurrence, ...occurrences].sort();
  const actualFirstOccurrence = Boolean(nextOccurrence && Date.parse(nextOccurrence) === Date.parse(event.start_date));
  const launchOccurrenceAt = campaign.launch_occurrence_at ?? (!event.is_recurring || actualFirstOccurrence ? nextOccurrence : null);
  const raw = occurrences.flatMap((eventOccurrenceAt) => proposeEventSchedule({ campaignId, campaignCreatedOn: campaign.starts_on ?? formatInTimeZone(campaign.created_at, SOCIAL_TIME_ZONE, "yyyy-MM-dd"), eventOccurrenceAt, today, isFirstOccurrence: launchOccurrenceAt === eventOccurrenceAt })).filter((proposal) => proposal.targetDate >= coverageStart && proposal.targetDate <= coverageEnd);

  const retained: ScheduleProposal[] = [];
  const suppressed: Array<Record<string, unknown>> = [];
  const reminderKeys = new Map<string, ScheduleProposal>();
  for (const proposal of raw) {
    if (proposal.kind !== "reminder") { retained.push(proposal); continue; }
    const channels = proposal.channels.filter((channel) => {
      const key = `${proposal.targetDate}:${channel}`;
      const owner = reminderKeys.get(key);
      if (!owner) { reminderKeys.set(key, proposal); return true; }
      suppressed.push({ channel, targetDate: proposal.targetDate, suppressedGenerationKey: proposal.generationKey, retainedGenerationKey: owner.generationKey, eventOccurrenceAt: proposal.eventOccurrenceAt });
      return false;
    });
    if (channels.length) retained.push({ ...proposal, channels });
  }

  const { data: occupiedRows, error: occupiedError } = await supabase.from("social_deliveries").select("schedule_platform, scheduled_date, time_slot, status, retryable").in("status", ["proposed", "scheduled", "due", "processing", "failed"]).gte("scheduled_date", today).lte("scheduled_date", coverageEnd);
  if (occupiedError) throw new Error(occupiedError.message);
  const occupied = (occupiedRows ?? [])
    .filter((row) => row.status !== "failed" || row.retryable)
    .map((row) => ({ schedulePlatform: row.schedule_platform, date: row.scheduled_date, slot: row.time_slot })) as OccupiedSlot[];
  const proposals = retained.map((proposal, sequence) => {
    const suggestions: Partial<Record<SocialChannel, { date: string; slot: SocialTimeSlot }>> = {};
    for (const channel of proposal.channels) {
      let candidateDate = proposal.targetDate;
      while (candidateDate >= today) {
        const option = availableSlots(channel, candidateDate, occupied, proposal.eventOccurrenceAt)[0];
        if (option) { suggestions[channel] = { date: option.date, slot: option.slot }; occupied.push({ schedulePlatform: schedulePlatformFor(channel), date: option.date, slot: option.slot }); break; }
        candidateDate = addCalendarDays(candidateDate, -1);
      }
    }
    const label = proposal.kind === "initial" ? "Initial post" : `${proposal.milestoneDays}-day reminder`;
    return { ...proposal, sequence, title: `${label}: ${event.title}`, caption: event.description, description: event.description, mediaUrl: event.poster_url, callToActionLink: event.call_to_action_link, callToActionCaption: event.call_to_action_caption, suggestions };
  });
  const { data: inserted, error: persistError } = await supabase.rpc("persist_social_campaign_proposals", { p_campaign_id: campaignId, p_proposals: proposals, p_suppressed: suppressed, p_generated_through: coverageEnd, p_launch_occurrence_at: launchOccurrenceAt, p_launch_decision_made: Boolean(campaign.launch_decision_made || !event.is_recurring || actualFirstOccurrence) });
  if (persistError) throw new Error(persistError.message);
  return { inserted: Number(inserted ?? 0), generatedThrough: coverageEnd, suppressed: suppressed.length };
}
