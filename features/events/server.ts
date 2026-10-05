import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DATABASE_PAGE_SIZE } from "./constants";
import {
  scheduleDates,
  campaignScheduleDates,
  resolvePoster,
  type BaseEvent,
  type Schedule,
  type ScheduleDate,
} from "./domain";
import { formatInTimeZone } from "date-fns-tz";


const SCHEDULE_FIELDS = "id,event_id,label,start_at,end_at,time_zone,poster_url,poster_alt,location,version,recurrence_rule_id,recurrence_rule(frequency,interval,by_weekdays,by_month_day,by_set_position,until,count,exdates)";
const EVENT_FIELDS = "id,title,description,location,poster_url,poster_alt,navigation_slug,cognito_form_id,call_to_action_link,call_to_action_caption,gallery_url,publication_status,version";
export interface ScheduleDateRow
  extends ScheduleDate, Omit<BaseEvent, "id" | "version"> {
  event_id: number;
  id: string;
  schedule_id: string;
}
export interface CalendarSchedule extends Schedule {
  events: BaseEvent;
}
export function normalizeSchedule<T extends Schedule>(schedule: T): T {
  const rule = schedule.recurrence_rule;
  if (!rule) return schedule;
  return {
    ...schedule,
    recurrence_rule: {
      ...rule,
      until: rule.until
        ? formatInTimeZone(rule.until, schedule.time_zone, "yyyy-MM-dd")
        : null,
      by_weekdays: rule.by_weekdays?.map((day) => day.toLowerCase()),
      exdates: rule.exdates?.map((day) => day.slice(0, 10)),
    },
  };
}
export async function readCalendarSchedules(
  supabase: SupabaseClient,
  eventId?: number,
): Promise<CalendarSchedule[]> {
  const rows: CalendarSchedule[] = [];
  for (;;) {
    let query = supabase
      .from("event_schedules")
      .select(`${SCHEDULE_FIELDS},events!inner(${EVENT_FIELDS})`)
      .eq("cancelled", false)
      .neq("events.publication_status", "archived")
      .order("id")
      .range(rows.length, rows.length + DATABASE_PAGE_SIZE - 1);
    if (eventId !== undefined) query = query.eq("event_id", eventId);
    const { data, error } = await query.returns<CalendarSchedule[]>();
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...(data as CalendarSchedule[]).map(normalizeSchedule));
  }
}
/** RRULE dates used transiently by reminders and the dashboard summary. */
export async function readScheduleDates(
  supabase: SupabaseClient,
  from: string | null,
  through: string,
  eventId?: number,
  forCampaign = false,
): Promise<ScheduleDateRow[]> {
  const schedules = await readCalendarSchedules(supabase, eventId);
  return schedules
    .flatMap((schedule) =>
      (forCampaign ? campaignScheduleDates(schedule, through) : scheduleDates(schedule, { from, through }))
        .filter(
          (date) =>
            !date.cancelled &&
            (!from || Date.parse(date.end_at) > Date.parse(from)) &&
            (forCampaign || Date.parse(date.start_at) < Date.parse(through)),
        )
        .map((date) => ({
          ...schedule.events,
          ...date,
          ...resolvePoster(schedule.events, schedule),
          location: schedule.location ?? schedule.events.location,
          id: `${schedule.id}:${date.original_key}`,
          event_id: schedule.event_id,
          schedule_id: schedule.id,
        })),
    )
    .sort(
      (a, b) =>
        Date.parse(a.start_at) - Date.parse(b.start_at) ||
        a.id.localeCompare(b.id),
    );
}
export interface ScheduleException {
  id: string;
  source_schedule_id: string;
  source_rule_id: number;
  excluded_date: string;
  replacement_schedule_id: string | null;
}
export async function readScheduleExceptions(
  supabase: SupabaseClient,
  eventId: number,
): Promise<ScheduleException[]> {
  const rows: ScheduleException[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("event_schedule_exceptions")
      .select("*")
      .eq("event_id", eventId)
      .order("excluded_date")
      .order("id")
      .range(rows.length, rows.length + DATABASE_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
export async function readEventDetail(supabase: SupabaseClient, id: number) {
  const [event, schedules, campaign] = await Promise.all([
    supabase.from("events").select(EVENT_FIELDS).eq("id", id).maybeSingle(),
    supabase
      .from("event_schedules")
      .select(SCHEDULE_FIELDS)
      .eq("event_id", id)
      .order("start_at")
      .returns<Schedule[]>(),
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
    schedules: ((schedules.data ?? []) as Schedule[]).map(normalizeSchedule),
    campaign: campaign.data as {
      id: string;
      name: string;
      status: string;
    } | null,
  };
}
