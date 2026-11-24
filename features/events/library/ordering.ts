import "server-only";
import { Temporal } from "temporal-polyfill";
import { nextScheduleDate } from "../domain";
import type { LibraryEvent, LibraryItem, LibrarySchedule, LibrarySort } from "./filters";

export function occurrenceItems(events: LibraryEvent[], schedules: LibrarySchedule[], referenceAt: string): LibraryItem[] {
  const next = new Map<number, string>();
  for (const schedule of schedules) {
    if (schedule.cancelled) continue;
    const candidate = nextScheduleDate(schedule, referenceAt);
    if (!candidate || candidate.cancelled) continue;
    const current = next.get(schedule.event_id);
    if (!current || Temporal.Instant.compare(candidate.start_at, current) < 0) next.set(schedule.event_id, candidate.start_at);
  }
  return events.map((event) => ({ ...event, next_occurrence: next.get(event.id) ?? null }));
}
export function compareLibraryKeys(a: { at: string | null; id: number }, b: { at: string | null; id: number }, sort: LibrarySort): number {
  if (a.at === null && b.at !== null) return 1;
  if (a.at !== null && b.at === null) return -1;
  const time = a.at !== null && b.at !== null ? Temporal.Instant.compare(a.at, b.at) : 0;
  return (sort === "next_occurrence" ? time : -time) || a.id - b.id;
}
export function libraryKey(item: LibraryItem, sort: LibrarySort) { return { at: item[sort], id: item.id }; }
export function orderLibrary(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  return [...items].sort((a, b) => compareLibraryKeys(libraryKey(a, sort), libraryKey(b, sort), sort));
}
