import "server-only";
import type { EventInput } from "@fullcalendar/react";
import type { ScheduleDateRow } from "../server";

/** Concrete, range-limited occurrences; recurrence stays on the server. */
export function calendarInputs(dates: ScheduleDateRow[]): EventInput[] {
  return dates.map(({ start_at, end_at, id, ...event }) => ({
    id,
    title: event.title,
    start: start_at,
    end: end_at,
    classNames: event.publication_status === "draft" ? ["opacity-60"] : [],
    extendedProps: event,
  }));
}
