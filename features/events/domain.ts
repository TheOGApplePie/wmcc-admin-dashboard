import { ISO_DATE_LENGTH } from "./constants";
import { MAX_SCHEDULE_OCCURRENCES, MAX_SCHEDULE_SPAN_DAYS, MILLISECONDS_PER_DAY } from "./constants";
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
  recurrence: Rule | null;
  poster_url: string | null;
  poster_alt: string;
  location: string | null;
  cancelled: boolean;
  version: number;
  materialized_version: number;
}
export interface Occurrence {
  id: string;
  event_id: number;
  schedule_id: string;
  original_key: string;
  start_at: string;
  end_at: string;
  generated_start_at: string;
  generated_end_at: string;
  cancelled: boolean;
  superseded: boolean;
  overridden: boolean;
  version: number;
}
export interface ResolvedOccurrence extends Occurrence {
  event: BaseEvent;
  schedule: Schedule;
  poster_url: string | null;
  poster_alt: string;
  location: string;
}
export interface GeneratedOccurrence {
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
  if (Boolean(rule.count) === Boolean(rule.until))
    throw new Error("Choose a count or end date.");
  if (rule.count && (rule.count < 1 || rule.count > MAX_SCHEDULE_OCCURRENCES))
    throw new Error("Use between 1 and 5,000 occurrences.");
  if (!(rule.frequency in frequencies))
    throw new Error("Invalid recurrence frequency.");
  const until = rule.until
    ? Temporal.PlainDate.from(rule.until.slice(0, ISO_DATE_LENGTH))
    : null;
  if (until && until.since(start.toPlainDate()).days > MAX_SCHEDULE_SPAN_DAYS)
    throw new Error("Schedules may span at most ten years.");
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
function validateGeneratedDates(dates: Date[], start: Temporal.PlainDateTime) {
  if (dates.length > MAX_SCHEDULE_OCCURRENCES)
    throw new Error("A schedule cannot exceed 5,000 sessions.");
  if (!dates.length || dates[0].getTime() !== new Date(`${start}Z`).getTime())
    throw new Error("The first date must match the recurrence pattern.");
  if (dates[dates.length - 1].getTime() - dates[0].getTime() > MAX_SCHEDULE_SPAN_DAYS * MILLISECONDS_PER_DAY)
    throw new Error("Schedules may span at most ten years.");
}
function resolveGeneratedDate(
  date: Date,
  duration: Temporal.Duration,
  timeZone: string,
  excluded: Set<string>,
): GeneratedOccurrence {
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
/** Finite schedules are materialized completely; never silently truncate coverage. */
export function generateOccurrences(
  schedule: Pick<Schedule, "start_at" | "end_at" | "time_zone" | "recurrence">,
): GeneratedOccurrence[] {
  const start = Temporal.Instant.from(schedule.start_at).toZonedDateTimeISO(
    schedule.time_zone,
  );
  const end = Temporal.Instant.from(schedule.end_at).toZonedDateTimeISO(
    schedule.time_zone,
  );
  if (end.epochMilliseconds <= start.epochMilliseconds)
    throw new Error("End must be after start.");
  if (!schedule.recurrence)
    return [
      {
        original_key: start.toPlainDate().toString(),
        start_at: schedule.start_at,
        end_at: schedule.end_at,
        cancelled: false,
      },
    ];
  const plain = start.toPlainDateTime();
  const dates = new RRule(recurrenceOptions(schedule.recurrence, plain)).all(
    (_date, index) => index <= MAX_SCHEDULE_OCCURRENCES,
  );
  validateGeneratedDates(dates, plain);
  const duration = plain.until(end.toPlainDateTime());
  const excluded = new Set(
    (schedule.recurrence.exdates ?? []).map((day) => day.slice(0, ISO_DATE_LENGTH)),
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
