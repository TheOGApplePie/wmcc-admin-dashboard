import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTorontoDateTime } from "@/app/utils/date";
import { DATABASE_PAGE_SIZE, EVENT_LIST_PAGE_SIZE } from "../constants";
import { normalizeSchedule } from "../server";
import { decodeLibraryCursor, encodeLibraryCursor, LibraryCursorError } from "./cursor";
import { compareLibraryKeys, libraryKey, occurrenceItems, orderLibrary } from "./ordering";
import type { LibraryEvent, LibraryFilters, LibraryPage, LibrarySchedule } from "./filters";

async function readFilteredEvents(supabase: SupabaseClient, filters: LibraryFilters): Promise<LibraryEvent[]> {
  const events: LibraryEvent[] = [];
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    let query = supabase.from("events").select("id,title,publication_status,poster_url,poster_alt,created_at,updated_at,version");
    if (filters.sort !== "next_occurrence") query = query.order(filters.sort, { ascending: false, nullsFirst: false });
    query = query.order("id").range(offset, offset + DATABASE_PAGE_SIZE - 1);
    if (filters.q) query = query.ilike("title", `%${filters.q}%`);
    if (filters.status) query = query.eq("publication_status", filters.status);
    const { data, error } = await query.returns<LibraryEvent[]>();
    if (error) throw new Error(error.message);
    events.push(...(data ?? []));
    if (!data || data.length < DATABASE_PAGE_SIZE) break;
  }
  return events;
}

async function readLibrarySchedules(supabase: SupabaseClient, events: LibraryEvent[]): Promise<LibrarySchedule[]> {
  const schedules: LibrarySchedule[] = [];
  // Bound each IN filter and database page; no occurrence expansion or horizon.
  for (let start = 0; start < events.length; start += 100) {
      const ids = events.slice(start, start + 100).map((event) => event.id);
      for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
        const { data, error } = await supabase.from("event_schedules")
          .select("id,event_id,start_at,end_at,time_zone,cancelled,recurrence_rule(frequency,interval,by_weekdays,by_month_day,by_set_position,until,count,exdates)").in("event_id", ids).order("id")
          .range(offset, offset + DATABASE_PAGE_SIZE - 1).returns<LibrarySchedule[]>();
        if (error) throw new Error(error.message);
        schedules.push(...(data ?? []).map(normalizeSchedule));
        if (!data || data.length < DATABASE_PAGE_SIZE) break;
      }
  }
  return schedules;
}

function scheduleKinds(schedules: LibrarySchedule[]) {
  const kinds = new Map<number, string>();
  for (const schedule of schedules) {
    if (schedule.cancelled) continue;
    const kind = schedule.recurrence_rule ? "Recurring" : "One-time";
    const previous = kinds.get(schedule.event_id);
    kinds.set(schedule.event_id, previous && previous !== kind ? "Multiple schedules" : kind);
  }
  return kinds;
}

export async function readLibraryPage(supabase: SupabaseClient, filters: LibraryFilters, token?: string): Promise<LibraryPage> {
  const now = Date.now();
  const cursor = token ? decodeLibraryCursor(token, filters, now) : null;
  const referenceAt = cursor?.referenceAt ?? new Date(now).toISOString();
  const events = await readFilteredEvents(supabase, filters);
  const schedules = await readLibrarySchedules(supabase, events);
  const occurrences = occurrenceItems(events, schedules, referenceAt);
  const byEvent = new Map(occurrences.map((item) => [item.id, item]));
  const kinds = scheduleKinds(schedules);
  const snapshot = createHash("sha256").update(JSON.stringify({ events, schedules })).digest("hex");
  if (cursor && cursor.snapshot !== snapshot) throw new LibraryCursorError("Events changed. Reload the event list from the first page.");
  const ordered = filters.sort === "next_occurrence"
    ? orderLibrary(occurrences, filters.sort)
    : events.map((event) => byEvent.get(event.id)!);
  if (cursor && !ordered.some((item) => compareLibraryKeys(libraryKey(item, filters.sort), cursor.last, filters.sort) === 0))
    throw new LibraryCursorError("The cursor no longer identifies an event in this list.");
  const remaining = cursor ? ordered.filter((item) => compareLibraryKeys(libraryKey(item, filters.sort), cursor.last, filters.sort) > 0) : ordered;
  const items = remaining.slice(0, EVENT_LIST_PAGE_SIZE);
  const last = items.at(-1);
  const rows = items.map((item) => {
    const at = item[filters.sort];
    let displayDate = filters.sort === "updated_at" ? "Update time unknown" : "No upcoming occurrence";
    if (at) displayDate = formatTorontoDateTime(at);
    return { id: item.id, title: item.title, publication_status: item.publication_status, display_date: displayDate,
      next_display_date: item.next_occurrence ? new Date(item.next_occurrence).toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Toronto" }) : null,
      poster_url: item.poster_url, poster_alt: item.poster_alt, schedule_kind: kinds.get(item.id) ?? null };
  });
  return { items: rows, referenceAt, total: events.length,
    cursor: remaining.length > items.length && last ? encodeLibraryCursor({ v: 1, ...filters, referenceAt, snapshot, last: libraryKey(last, filters.sort) }) : null };
}
