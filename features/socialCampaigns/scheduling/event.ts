import { formatInTimeZone } from "date-fns-tz";
import { addCalendarDays, calendarDayDifference } from "./dates";
import { SOCIAL_TIME_ZONE, type EventMilestone, type EventScheduleInput, type ScheduleProposal } from "./types";

const REMINDERS: ReadonlyArray<{ milestone: EventMilestone; days: number }> = [
  { milestone: "two_weeks", days: 14 },
  { milestone: "one_week", days: 7 },
  { milestone: "two_days", days: 2 },
  { milestone: "one_day", days: 1 },
  { milestone: "event_day", days: 0 },
];

export function eventLocalDate(eventOccurrenceAt: string): string {
  return formatInTimeZone(eventOccurrenceAt, SOCIAL_TIME_ZONE, "yyyy-MM-dd");
}

export function proposeEventSchedule(input: EventScheduleInput): ScheduleProposal[] {
  const eventDate = eventLocalDate(input.eventOccurrenceAt);
  if (eventDate < input.today) return [];

  const first = input.isFirstOccurrence ?? true;
  const daysAvailable = calendarDayDifference(eventDate, input.campaignCreatedOn);
  const compressed = daysAvailable < 21;
  const proposals: ScheduleProposal[] = [];

  if (first) {
    const initialDate = input.campaignCreatedOn < input.today ? input.today : input.campaignCreatedOn;
    if (initialDate <= eventDate) {
      proposals.push({
        generationKey: `${input.campaignId}:${input.eventOccurrenceAt}:initial`,
        kind: "initial",
        milestone: "initial",
        milestoneDays: 21,
        targetDate: initialDate,
        eventOccurrenceAt: input.eventOccurrenceAt,
        channels: ["instagram_feed", "whatsapp"],
        compressed,
      });
    }
  }

  for (const reminder of REMINDERS) {
    const targetDate = addCalendarDays(eventDate, -reminder.days);
    if (targetDate < input.today || targetDate < input.campaignCreatedOn) continue;
    proposals.push({
      generationKey: `${input.campaignId}:${input.eventOccurrenceAt}:${reminder.milestone}`,
      kind: "reminder",
      milestone: reminder.milestone,
      milestoneDays: reminder.days,
      targetDate,
      eventOccurrenceAt: input.eventOccurrenceAt,
      channels: ["instagram_story", "whatsapp"],
      compressed,
    });
  }

  return proposals;
}

export function proposeRecurringSchedule(
  campaignId: string,
  campaignCreatedOn: string,
  eventOccurrences: string[],
  today: string,
): ScheduleProposal[] {
  const sorted = [...new Set(eventOccurrences)].sort((a, b) => Date.parse(a) - Date.parse(b));
  const seenReminderDeliveries = new Set<string>();
  const output: ScheduleProposal[] = [];

  sorted.forEach((eventOccurrenceAt, index) => {
    for (const proposal of proposeEventSchedule({
      campaignId,
      campaignCreatedOn,
      eventOccurrenceAt,
      today,
      isFirstOccurrence: index === 0,
    })) {
      if (proposal.kind !== "reminder") {
        output.push(proposal);
        continue;
      }

      // The nearest upcoming occurrence owns a duplicate reminder delivery.
      const remainingChannels = proposal.channels.filter((channel) => {
        const key = `${proposal.targetDate}:${channel}`;
        if (seenReminderDeliveries.has(key)) return false;
        seenReminderDeliveries.add(key);
        return true;
      });
      if (remainingChannels.length > 0) output.push({ ...proposal, channels: remainingChannels });
    }
  });

  return output;
}

