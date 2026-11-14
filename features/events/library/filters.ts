import type { Schedule } from "../domain";
import { EVENT_FIELD_LIMITS } from "../constants";

export const librarySorts = ["next_occurrence", "created_at", "updated_at"] as const;
export type LibrarySort = typeof librarySorts[number];
export type LibraryFilters = { q: string; status: string; sort: LibrarySort };
export type LibraryEvent = {
  id: number; title: string; publication_status: string;
  poster_url: string | null; poster_alt: string;
  created_at: string; updated_at: string | null; version: number;
};
export type LibraryItem = LibraryEvent & { next_occurrence: string | null };
export type LibraryDisplayItem = Pick<LibraryEvent, "id" | "title" | "publication_status"> & { display_date: string; next_display_date: string | null; poster_url: string | null; poster_alt: string; schedule_kind: string | null };
export type LibraryPage = { items: LibraryDisplayItem[]; cursor: string | null; referenceAt: string; total: number };
export type LibrarySchedule = Pick<Schedule, "id" | "event_id" | "start_at" | "end_at" | "time_zone" | "recurrence_rule"> & { cancelled: boolean };
export function parseLibraryFilters(input: { q?: string; status?: string; sort?: string }): LibraryFilters {
  return {
    q: (typeof input.q === "string" ? input.q : "").trim().replace(/[%_]/g, "").slice(0, EVENT_FIELD_LIMITS.shortTextMax),
    status: ["draft", "published", "archived"].find((status) => status === input.status) ?? "",
    sort: librarySorts.find((sort) => sort === input.sort) ?? "next_occurrence",
  };
}
export function libraryHref(filters: LibraryFilters): string {
  const params = new URLSearchParams({ sort: filters.sort });
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  return `/dashboard/events/library?${params}`;
}
