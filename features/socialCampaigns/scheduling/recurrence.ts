import { formatInTimeZone } from "date-fns-tz";
import { RRule, type Weekday } from "rrule";
import { Temporal } from "temporal-polyfill";
import { SOCIAL_TIME_ZONE } from "./types";

export interface CampaignRecurrenceRule {
  frequency: string;
  interval: number | null;
  by_weekdays: string[] | null;
  by_month_day: number | null;
  by_set_position: number[] | null;
  until: string | null;
  count: number | null;
  exdates: string[] | null;
}

const FREQUENCIES: Record<string, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
};
const WEEKDAYS: Record<string, Weekday> = {
  MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH,
  FR: RRule.FR, SA: RRule.SA, SU: RRule.SU,
};

function floatingWallTime(value: string): string {
  return formatInTimeZone(value, SOCIAL_TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function parseWeekday(value: string): Weekday {
  const match = /^(-?\d+)?([A-Z]{2})$/.exec(value.toUpperCase());
  const weekday = match ? WEEKDAYS[match[2]] : undefined;
  if (!match || !weekday) throw new Error("The event recurrence contains an invalid weekday.");
  return match[1] ? weekday.nth(Number(match[1])) : weekday;
}

function floatingDateToInstant(value: Date): string {
  const plain = Temporal.PlainDateTime.from(value.toISOString().replace(/Z$/, ""));
  return plain.toZonedDateTime(SOCIAL_TIME_ZONE).toInstant().toString();
}

function buildRule(eventStart: string, rule: CampaignRecurrenceRule): RRule {
  const frequency = FREQUENCIES[rule.frequency.toLowerCase()];
  if (frequency === undefined) throw new Error("The event recurrence frequency is invalid.");
  const options: ConstructorParameters<typeof RRule>[0] = {
    freq: frequency,
    dtstart: new Date(`${floatingWallTime(eventStart)}Z`),
  };
  if (rule.interval) options.interval = rule.interval;
  if (rule.count) options.count = rule.count;
  if (rule.until) options.until = new Date(`${rule.until.slice(0, 10)}T23:59:59.999Z`);
  if (rule.by_month_day) options.bymonthday = rule.by_month_day;
  if (rule.by_set_position?.length) options.bysetpos = rule.by_set_position;
  if (rule.by_weekdays?.length) options.byweekday = rule.by_weekdays.map(parseWeekday);
  return new RRule(options);
}

export function expandCampaignOccurrences(
  eventStart: string,
  rule: CampaignRecurrenceRule | null,
  fromDate: string,
  throughDate: string,
): string[] {
  if (!rule) {
    const eventDate = formatInTimeZone(eventStart, SOCIAL_TIME_ZONE, "yyyy-MM-dd");
    return eventDate >= fromDate && eventDate <= throughDate ? [new Date(eventStart).toISOString()] : [];
  }

  const excluded = new Set((rule.exdates ?? []).map((date) => date.slice(0, 10)));
  const from = new Date(`${fromDate}T00:00:00Z`);
  const through = new Date(`${throughDate}T23:59:59.999Z`);
  return buildRule(eventStart, rule)
    .between(from, through, true)
    .filter((date) => !excluded.has(date.toISOString().slice(0, 10)))
    .map(floatingDateToInstant);
}

export function nextCampaignOccurrence(
  eventStart: string,
  rule: CampaignRecurrenceRule | null,
  onOrAfterDate: string,
): string | null {
  if (!rule) {
    return formatInTimeZone(eventStart, SOCIAL_TIME_ZONE, "yyyy-MM-dd") >= onOrAfterDate
      ? new Date(eventStart).toISOString()
      : null;
  }
  const excluded = new Set((rule.exdates ?? []).map((date) => date.slice(0, 10)));
  const recurrence = buildRule(eventStart, rule);
  let candidate = recurrence.after(new Date(`${onOrAfterDate}T00:00:00Z`), true);
  while (candidate && excluded.has(candidate.toISOString().slice(0, 10))) {
    candidate = recurrence.after(candidate, false);
  }
  return candidate ? floatingDateToInstant(candidate) : null;
}
