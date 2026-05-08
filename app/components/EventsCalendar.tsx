"use client";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import rrulePlugin from "@fullcalendar/rrule";
import { EventClickArg } from "@fullcalendar/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Event } from "@/app/schemas/events";
import { fetchAllEvents } from "@/actions/events";
import EventModal from "./eventModal";

type FCEventInput = {
  id: string;
  title: string;
  start?: string;
  end?: string;
  rrule?: object;
  duration?: string;
  exdate?: string[];
  extendedProps: { eventData: Event };
};

function toFloatingToronto(isoDate: string): string {
  const date = new Date(isoDate);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

function toFCEvent(event: Event): FCEventInput {
  const base = {
    id: String(event.id),
    title: event.title,
    extendedProps: { eventData: event },
  };

  if (event.is_recurring && event.recurrence_rule) {
    const rule = event.recurrence_rule;
    const durationMs =
      new Date(event.end_date).getTime() - new Date(event.start_date).getTime();
    const totalMins = Math.floor(durationMs / 60000);
    const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
    const mm = String(totalMins % 60).padStart(2, "0");
    const dtstart = toFloatingToronto(new Date(event.start_date).toISOString());
    const torontoTime = dtstart.substring(11);
    const exdate = (rule.exdates ?? []).map((d) => `${d}T${torontoTime}`);

    return {
      ...base,
      rrule: {
        freq: rule.frequency.toUpperCase(), // 'DAILY' | 'WEEKLY' | 'MONTHLY'
        dtstart,
        ...(rule.interval && rule.interval > 1 && { interval: rule.interval }),
        ...(rule.until && {
          until: toFloatingToronto(new Date(rule.until).toISOString()),
        }),
        ...(rule.count && { count: rule.count }),
        ...(rule.by_weekdays?.length && { byweekday: rule.by_weekdays }),
        ...(rule.by_month_day && { bymonthday: rule.by_month_day }),
        ...(rule.by_set_position?.length && {
          bysetpos: rule.by_set_position,
        }),
      },
      duration: `${hh}:${mm}`,
      exdate,
    };
  }

  return {
    ...base,
    start: toFloatingToronto(new Date(event.start_date).toISOString()),
    end: toFloatingToronto(new Date(event.end_date).toISOString()),
  };
}

export default function EventsCalendar() {
  const [fcEvents, setFcEvents] = useState<FCEventInput[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | undefined>(
    undefined,
  );
  const [occurrenceDate, setOccurrenceDate] = useState<Date | undefined>(
    undefined,
  );
  const editModalRef = useRef<HTMLDialogElement>(null);

  const loadEvents = useCallback(async () => {
    const result = await fetchAllEvents({});
    if (result?.data?.data) {
      setFcEvents(result.data.data.map(toFCEvent));
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    const eventData: Event = info.event.extendedProps.eventData;
    const occDate = info.event.start ?? new Date();
    setSelectedEvent(eventData);
    setOccurrenceDate(occDate);
    editModalRef.current?.showModal();
  };

  const openAddModal = () => {
    setSelectedEvent(undefined);
    setOccurrenceDate(undefined);
    editModalRef.current?.showModal();
  };

  const closeEditModal = (reloadEvents: boolean) => {
    editModalRef.current?.close();
    if (reloadEvents) loadEvents();
  };

  return (
    <div className="relative p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Events</h1>
        <button className="btn btn-success" onClick={openAddModal}>
          Add New Event
        </button>
      </div>

      <FullCalendar
        plugins={[dayGridPlugin, listPlugin, interactionPlugin, rrulePlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,listMonth",
        }}
        events={fcEvents as never}
        eventClick={handleEventClick}
        height="auto"
      />

      <dialog ref={editModalRef} className="modal">
        <EventModal
          event={selectedEvent}
          occurrenceDate={occurrenceDate}
          closeModal={closeEditModal}
        />
      </dialog>
    </div>
  );
}
