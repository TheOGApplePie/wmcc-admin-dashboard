import { RRule, type Weekday, type ByWeekday } from "rrule";
import type { Event } from "@/app/schemas/events";

export type Occurrence = { event: Event; occurrenceDate: Date };

type RecurrenceRule = NonNullable<Event["recurrence_rule"]>;

const FREQ_MAP: Record<string, number> = {
  daily:   RRule.DAILY,
  weekly:  RRule.WEEKLY,
  monthly: RRule.MONTHLY,
};

const WEEKDAY_MAP: Record<string, Weekday> = {
  MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH,
  FR: RRule.FR, SA: RRule.SA, SU: RRule.SU,
};

const WEEKDAY_RE = /^(-?\d+)?([A-Z]{2})$/;

// For date-only values already stored as UTC midnight (recurrence.until, calendar grid cells).
export function toUTCDay(d: Date | string): Date {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// For event timestamps stored in UTC — converts to the America/Toronto calendar date,
// then returns it as UTC midnight so grid comparisons (isoDate / >=, <=) stay consistent.
// Without this, a 9pm EDT event stored as next-day UTC lands on the wrong grid cell.
export function toEstDay(d: Date | string): Date {
  const estStr = new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const [year, month, day] = estStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseWeekday(raw: ByWeekday): Weekday {
  // DB stores codes lowercase ("su", "mo") — normalize before matching.
  const m = WEEKDAY_RE.exec(`${raw}`.toUpperCase());
  if (!m) return RRule.MO;
  const weekday = WEEKDAY_MAP[m[2]] ?? RRule.MO;
  return m[1] ? weekday.nth(Number.parseInt(m[1], 10)) : weekday;
}

function buildRRuleOptions(rule: RecurrenceRule, dtstart: Date): ConstructorParameters<typeof RRule>[0] {
  const opts: ConstructorParameters<typeof RRule>[0] = {
    freq: FREQ_MAP[rule.frequency.toLowerCase()] ?? RRule.WEEKLY,
    dtstart,
  };

  if (rule.interval && rule.interval > 1) opts.interval   = rule.interval;
  if (rule.count)                          opts.count      = rule.count;
  if (rule.by_month_day)                   opts.bymonthday = rule.by_month_day;
  if (rule.by_set_position?.length)        opts.bysetpos   = rule.by_set_position;
  if (rule.by_weekdays?.length)            opts.byweekday  = rule.by_weekdays.map(parseWeekday);

  // rule.until is a date-only value stored as UTC midnight — keep toUTCDay here.
  if (rule.until)                          opts.until      = toUTCDay(rule.until);

  return opts;
}

function expandRecurring(event: Event, rule: RecurrenceRule, startDay: Date, from: Date, to: Date): Occurrence[] {
  const exdates = new Set(rule.exdates ?? []);

  try {
    const dates = new RRule(buildRRuleOptions(rule, startDay)).between(from, to, true);
    return dates
      .filter((d) => !exdates.has(d.toISOString().split("T")[0]))
      .map((occurrenceDate) => ({ event, occurrenceDate }));
  } catch {
    return startDay >= from && startDay <= to
      ? [{ event, occurrenceDate: startDay }]
      : [];
  }
}

export function expandEventsToRange(events: Event[], from: Date, to: Date): Occurrence[] {
  const result: Occurrence[] = [];

  for (const event of events) {
    // Use the EST calendar date so a 9 pm EDT event doesn't land on the next UTC day.
    const startDay = toEstDay(event.start_date);

    if (event.is_recurring && event.recurrence_rule) {
      result.push(...expandRecurring(event, event.recurrence_rule, startDay, from, to));
    } else if (startDay >= from && startDay <= to) {
      result.push({ event, occurrenceDate: startDay });
    }
  }

  return result;
}
