import type { Occurrence, Schedule } from "../domain";
export type Campaign = { id: string; name: string; status: string };
export type Editor = { schedule?: Schedule; splitFrom?: string };

export function matchesFilter(
  occurrence: Occurrence,
  schedule: Schedule | undefined,
  filter: string,
  now: number,
) {
  const cancelled = occurrence.cancelled || schedule?.cancelled;
  if (filter === "cancelled") return cancelled;
  if (filter === "all") return true;
  if (cancelled) return false;
  if (filter === "past") return Date.parse(occurrence.end_at) <= now;
  return Date.parse(occurrence.end_at) > now;
}

export function splitEditor(
  schedule: Schedule,
  session: Occurrence,
  occurrences: Occurrence[],
): Editor {
  if (!schedule.recurrence?.count)
    return { schedule, splitFrom: session.original_key };
  const count = occurrences.filter(
    (row) =>
      row.schedule_id === schedule.id &&
      row.original_key >= session.original_key,
  ).length;
  return {
    schedule: { ...schedule, recurrence: { ...schedule.recurrence, count } },
    splitFrom: session.original_key,
  };
}
