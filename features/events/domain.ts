import {
  MAX_SCHEDULE_OCCURRENCES,
  MAX_SCHEDULE_SPAN_DAYS,
  MILLISECONDS_PER_DAY,
  ISO_DATE_LENGTH,
} from "./constants";
import { RRule, type Weekday } from "rrule";
import { Temporal } from "temporal-polyfill";

export type PublicationStatus = "draft" | "published" | "archived";
export interface Rule {
  frequency: "daily" | "weekly" | "monthly";
  interval: number | null;
  by_weekdays?: string[];
  by_month_day: number | null;
  by_set_position?: number[];
  until: string | null;
  count: number | null;
  exdates?: string[];
}
export interface BaseEvent {
  id: number;
  title: string;
  description: string;
  location: string;
  poster_url: string | null;
  poster_alt: string;
  navigation_slug: string;
  call_to_action_link: string | null;
  call_to_action_caption: string | null;
  gallery_url: string | null;
  publication_status: PublicationStatus;
  version: number;
}
export interface Schedule {
  id: string;
  event_id: number;
  label: string;
  start_at: string;
  end_at: string;
  time_zone: string;
  recurrence_rule: Rule | null;
  poster_url: string | null;
  poster_alt: string;
  location: string | null;
  version: number;
  recurrence_rule_id: number | null;
}
export interface ScheduleDate {
  original_key: string;
  start_at: string;
  end_at: string;
  cancelled: boolean;
}
const weekdays: Record<string, Weekday> = {
  SU: RRule.SU,
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
};
const frequencies = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
};

function parseWeekday(day: string): Weekday {
  const match = /^(-?\d+)?([A-Z]{2})$/.exec(day.toUpperCase());
  if (!match || !weekdays[match[2]]) throw new Error("Invalid weekday.");
  const weekday = weekdays[match[2]];
  return match[1] ? weekday.nth(Number(match[1])) : weekday;
}
function recurrenceOptions(rule: Rule, start: Temporal.PlainDateTime) {
  if (!(rule.frequency in frequencies))
    throw new Error("Invalid recurrence frequency.");
  const until = rule.until
    ? Temporal.PlainDate.from(rule.until.slice(0, ISO_DATE_LENGTH))
    : null;
  const options: ConstructorParameters<typeof RRule>[0] = {
    freq: frequencies[rule.frequency],
    interval: rule.interval ?? 1,
    dtstart: new Date(`${start}Z`),
  };
  if (rule.count) options.count = rule.count;
  if (until) options.until = new Date(`${until}T23:59:59.999Z`);
  if (rule.by_weekdays?.length)
    options.byweekday = rule.by_weekdays.map(parseWeekday);
  if (rule.by_month_day) options.bymonthday = rule.by_month_day;
  if (rule.by_set_position?.length) options.bysetpos = rule.by_set_position;
  return options;
}
function resolveGeneratedDate(
  date: Date,
  duration: Temporal.Duration,
  timeZone: string,
  excluded: Set<string>,
): ScheduleDate {
  const plain = Temporal.PlainDateTime.from(
    date.toISOString().replace(/Z$/, ""),
  );
  const start = plain.toZonedDateTime(timeZone, { disambiguation: "reject" });
  const end = plain
    .add(duration)
    .toZonedDateTime(timeZone, { disambiguation: "reject" });
  if (end.epochMilliseconds <= start.epochMilliseconds)
    throw new Error("A session has an invalid duration.");
  const key = plain.toPlainDate().toString();
  return {
    original_key: key,
    start_at: start.toInstant().toString(),
    end_at: end.toInstant().toString(),
    cancelled: excluded.has(key),
  };
}
function datesInRange(
  rule: RRule, start: Temporal.PlainDateTime, duration: Temporal.Duration, timeZone: string,
  range?: { from: string | null; through: string },
): Date[] {
  if (!range) {
    if (!rule.options.count && !rule.options.until) throw new Error("A date range is required for an open-ended schedule.");
    return rule.all();
  }
  const lower = range.from
    ? Temporal.Instant.from(range.from).toZonedDateTimeISO(timeZone).toPlainDateTime().subtract(duration)
    : start;
  const upper = Temporal.Instant.from(range.through).toZonedDateTimeISO(timeZone).toPlainDateTime();
  if (Temporal.PlainDateTime.compare(lower, upper) >= 0) return [];
  return rule.between(new Date(`${lower}Z`), new Date(`${upper}Z`), true);
}
/** RRULE expansion for reminders and upcoming summaries only; never persisted. */
export function scheduleDates(
  schedule: Pick<
    Schedule,
    "start_at" | "end_at" | "time_zone" | "recurrence_rule"
  >,
  range?: { from: string | null; through: string },
): ScheduleDate[] {
  const start = Temporal.Instant.from(schedule.start_at).toZonedDateTimeISO(
    schedule.time_zone,
  );
  const end = Temporal.Instant.from(schedule.end_at).toZonedDateTimeISO(
    schedule.time_zone,
  );
  if (end.epochMilliseconds <= start.epochMilliseconds)
    throw new Error("End must be after start.");
  if (!schedule.recurrence_rule)
    return [
      {
        original_key: start.toPlainDate().toString(),
        start_at: schedule.start_at,
        end_at: schedule.end_at,
        cancelled: false,
      },
    ];
  const plain = start.toPlainDateTime();
  const rule = new RRule(recurrenceOptions(schedule.recurrence_rule, plain));
  const duration = plain.until(end.toPlainDateTime());
  const dates = datesInRange(rule, plain, duration, schedule.time_zone, range);
  const excluded = new Set(
    (schedule.recurrence_rule.exdates ?? []).map((day) =>
      day.slice(0, ISO_DATE_LENGTH),
    ),
  );
  return dates.map((date) =>
    resolveGeneratedDate(date, duration, schedule.time_zone, excluded),
  );
}
export function resolvePoster(
  event: Pick<BaseEvent, "poster_url" | "poster_alt">,
  schedule: Pick<Schedule, "poster_url" | "poster_alt">,
) {
  return schedule.poster_url
    ? { poster_url: schedule.poster_url, poster_alt: schedule.poster_alt }
    : { poster_url: event.poster_url, poster_alt: event.poster_alt };
}

/** Validate a schedule without materializing its recurrence. */
export function validateSchedule(
  schedule: Pick<
    Schedule,
    "start_at" | "end_at" | "time_zone" | "recurrence_rule"
  >,
) {
  const start = Temporal.Instant.from(schedule.start_at).toZonedDateTimeISO(
    schedule.time_zone,
  );
  const end = Temporal.Instant.from(schedule.end_at).toZonedDateTimeISO(
    schedule.time_zone,
  );
  if (end.epochMilliseconds <= start.epochMilliseconds)
    throw new Error("End must be after start.");
  if (!schedule.recurrence_rule) return;
  if (Boolean(schedule.recurrence_rule.count) === Boolean(schedule.recurrence_rule.until))
    throw new Error("Choose a count or end date.");
  if (schedule.recurrence_rule.count && (schedule.recurrence_rule.count < 1 || schedule.recurrence_rule.count > MAX_SCHEDULE_OCCURRENCES))
    throw new Error("Use between 1 and 5,000 occurrences.");
  const anchor = new Date(`${start.toPlainDateTime()}Z`);
  const rule = new RRule(
    recurrenceOptions(schedule.recurrence_rule, start.toPlainDateTime()),
  );
  if (rule.after(anchor, true)?.getTime() !== anchor.getTime())
    throw new Error("The first date must match the recurrence pattern.");
  if (rule.after(new Date(anchor.getTime() + MAX_SCHEDULE_SPAN_DAYS * MILLISECONDS_PER_DAY), false))
    throw new Error("Schedules may span at most ten years.");
}
export function scheduleDateIndex(schedule: Schedule, date: string): number {
  const start = Temporal.Instant.from(schedule.start_at)
    .toZonedDateTimeISO(schedule.time_zone)
    .toPlainDateTime();
  const selected = Temporal.PlainDate.from(date).toPlainDateTime(
    start.toPlainTime(),
  );
  if (!schedule.recurrence_rule)
    throw new Error("Select a recurring schedule.");
  const rule = new RRule(recurrenceOptions(schedule.recurrence_rule, start));
  const target = new Date(`${selected}Z`);
  if (rule.after(target, true)?.getTime() !== target.getTime())
    throw new Error("Choose a date in this schedule's recurrence rule.");
  return rule.between(new Date(`${start}Z`), target, true).length - 1;
}

/** Find one active date for campaign launch selection without expanding an open-ended rule. */
export function nextScheduleDate(schedule: Schedule, after?: string): ScheduleDate | null {
  const start = Temporal.Instant.from(schedule.start_at).toZonedDateTimeISO(schedule.time_zone).toPlainDateTime();
  const end = Temporal.Instant.from(schedule.end_at).toZonedDateTimeISO(schedule.time_zone).toPlainDateTime();
  if (!schedule.recurrence_rule) {
    if (after && Date.parse(schedule.start_at) <= Date.parse(after)) return null;
    return { original_key: start.toPlainDate().toString(), start_at: schedule.start_at, end_at: schedule.end_at, cancelled: false };
  }
  const rule = new RRule(recurrenceOptions(schedule.recurrence_rule, start));
  const lower = after ? Temporal.Instant.from(after).toZonedDateTimeISO(schedule.time_zone).toPlainDateTime() : start;
  let candidate = rule.after(new Date(`${lower}Z`), !after);
  const excluded = new Set((schedule.recurrence_rule.exdates ?? []).map(date => date.slice(0, ISO_DATE_LENGTH)));
  while (candidate) {
    const date = resolveGeneratedDate(candidate, start.until(end), schedule.time_zone, excluded);
    if (!date.cancelled) return date;
    candidate = rule.after(candidate, false);
  }
  return null;
}
export function campaignScheduleDates(schedule: Schedule, through: string): ScheduleDate[] {
  const now = new Date().toISOString();
  const dates = scheduleDates(schedule, { from: now, through });
  // Include the first and next active dates even when the next event is beyond the reminder horizon.
  // Initial announcements can still be due today for that future event.
  for (const date of [nextScheduleDate(schedule), nextScheduleDate(schedule, now)]) {
    if (date && !dates.some(existing => existing.original_key === date.original_key)) dates.push(date);
  }
  return dates;
}
