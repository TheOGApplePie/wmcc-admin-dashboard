import { DATABASE_PAGE_SIZE } from "./constants";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import {
  generateOccurrences,
  type BaseEvent,
  type Schedule,
  type Occurrence,
} from "./domain";
export interface OccurrenceRow
  extends Occurrence, Omit<BaseEvent, "id" | "version"> {
  event_id: number;
  schedule_cancelled: boolean;
}
/** Compatibility backfill. New writes materialize inside their transaction. */
export async function ensureEventCoverage(
  supabase: SupabaseClient,
  eventId?: number,
) {
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    let query = supabase
      .from("event_schedules")
      .select("*")
      .order("id")
      .range(offset, offset + DATABASE_PAGE_SIZE - 1);
    if (eventId) query = query.eq("event_id", eventId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    for (const schedule of (data ?? []) as Schedule[]) {
      if (schedule.version === schedule.materialized_version) continue;
      const occurrences = generateOccurrences(schedule);
      const { error: syncError } = await createServiceClient().rpc(
        "materialize_event_schedule",
        {
          p_schedule_id: schedule.id,
          p_version: schedule.version,
          p_occurrences: occurrences,
        },
      );
      if (syncError)
        throw new Error(
          `Schedule ${schedule.label || schedule.id}: ${syncError.message}`,
        );
    }
    if (!data || data.length < DATABASE_PAGE_SIZE) return;
  }
}
export async function readOccurrences(
  supabase: SupabaseClient,
  from: string | null,
  through: string | null,
  eventId?: number,
  includeCancelled = false,
  materialize = true,
): Promise<OccurrenceRow[]> {
  if (materialize) await ensureEventCoverage(supabase, eventId);
  const rows: OccurrenceRow[] = [];
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    let query = supabase
      .from("resolved_event_occurrences")
      .select("*")
      .eq("superseded", false)
      .order("start_at")
      .order("id")
      .range(offset, offset + DATABASE_PAGE_SIZE - 1);
    if (from) query = query.gt("end_at", from);
    if (through) query = query.lt("start_at", through);
    if (eventId) query = query.eq("event_id", eventId);
    if (!includeCancelled)
      query = query
        .eq("cancelled", false)
        .eq("schedule_cancelled", false)
        .neq("publication_status", "archived");
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as OccurrenceRow[]));
    if (!data || data.length < DATABASE_PAGE_SIZE) return rows;
  }
}
export async function readEventDetail(supabase: SupabaseClient, id: number) {
  const [event, schedules, campaign] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("event_schedules")
      .select("*")
      .eq("event_id", id)
      .order("start_at"),
    supabase
      .from("social_campaigns")
      .select("id,name,status")
      .eq("event_id", id)
      .maybeSingle(),
  ]);
  if (event.error || schedules.error || campaign.error)
    throw new Error(
      event.error?.message ??
        schedules.error?.message ??
        campaign.error?.message,
    );
  return {
    event: event.data as BaseEvent | null,
    schedules: (schedules.data ?? []) as Schedule[],
    campaign: campaign.data as {
      id: string;
      name: string;
      status: string;
    } | null,
  };
}
