import type { EventInput } from "@fullcalendar/react";
import type { CalendarSchedule } from "../server";
import { Temporal } from "temporal-polyfill";
import { resolvePoster } from "../domain";
export function calendarInputs(schedules: CalendarSchedule[]): EventInput[] {
  return schedules.map((schedule) => {
    const event = schedule.events;
    const rule = schedule.recurrence_rule;
    const start = Temporal.Instant.from(schedule.start_at)
      .toZonedDateTimeISO(schedule.time_zone)
      .toPlainDateTime();
    const end = Temporal.Instant.from(schedule.end_at)
      .toZonedDateTimeISO(schedule.time_zone)
      .toPlainDateTime();
    const base = {
      id: schedule.id,
      title: event.title,
      classNames: event.publication_status === "draft" ? ["opacity-60"] : [],
      extendedProps: {
        ...event,
        ...resolvePoster(event, schedule),
        event_id: event.id,
        schedule_id: schedule.id,
        location: schedule.location ?? event.location,
        recurrence_rule: rule,
      },
    };
    if (!rule)
      return { ...base, start: schedule.start_at, end: schedule.end_at };
    return {
      ...base,
      rrule: {
        freq: rule.frequency,
        dtstart: start.toString(),
        wkst: "mo",
        interval: rule.interval ?? 1,
        byweekday: rule.by_weekdays,
        bymonthday: rule.by_month_day ?? undefined,
        bysetpos: rule.by_set_position,
        count: rule.count ?? undefined,
        until: rule.until ? `${rule.until}T23:59:59` : undefined,
      },
      duration: {
        milliseconds: start.until(end).total({ unit: "milliseconds" }),
      },
      exdate: (rule.exdates ?? []).map(
        (date) => `${date}T${start.toPlainTime()}`,
      ),
    };
  });
}
