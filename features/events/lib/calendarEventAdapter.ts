import { type Event } from "@/app/schemas/events";
import { type EventApi, type EventClickInfo } from "@fullcalendar/react";

export function eventFromCalendarApi(calendarEvent: EventApi): Event {
  const { extendedProps } = calendarEvent;
  const recurrenceRule = extendedProps.recurrence_rule;
  const start = calendarEvent.start ?? new Date();

  return {
    id: Number(calendarEvent.id),
    title: calendarEvent.title,
    description: extendedProps.description,
    location: extendedProps.location,
    poster_url: extendedProps.poster_url,
    poster_file: extendedProps.poster_file ?? null,
    poster_alt: extendedProps.poster_alt,
    call_to_action_link: extendedProps.call_to_action_link,
    call_to_action_caption: extendedProps.call_to_action_caption,
    action: extendedProps.action,
    gallery_url: extendedProps.gallery_url,
    navigation_slug: extendedProps.navigation_slug,
    is_recurring: Boolean(recurrenceRule),
    recurrence_rule: recurrenceRule ?? undefined,
    recurrence_rule_id: recurrenceRule?.id,
    start_date: start,
    end_date: calendarEvent.end ?? start,
  };
}

export function eventFromCalendarClick(info: EventClickInfo): Event {
  return eventFromCalendarApi(info.event);
}
