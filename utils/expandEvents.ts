import type { Event } from "@/app/schemas/events";
import { torontoDate } from "@/app/utils/date";
export type Occurrence = { event: Event; occurrenceDate: Date };
/** Date label only. Session expansion is owned by features/events/domain.ts. */
export function toEstDay(value: Date | string): Date {
  return new Date(`${torontoDate(value)}T00:00:00Z`);
}
