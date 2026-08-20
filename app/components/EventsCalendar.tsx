"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Event } from "@/app/schemas/events";
import EventModal from "./eventModal";
import FullCalendar, {
  type EventApi,
  type EventClickInfo,
  useCalendarController,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import themePlugin from "@fullcalendar/react/themes/classic";
import luxonFormatPlugin from "@fullcalendar/format-luxon3";
import rrulePlugin from "@fullcalendar/rrule";
import interactionPlugin from "@fullcalendar/react/interaction";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import { CalendarToolbar } from "@/features/events/components/CalendarToolbar";
import { EventDetailsPanel } from "@/features/events/components/EventDetailsPanel";
import { EmptyCalendarState } from "@/features/events/components/EmptyCalendarState";
import { useCalendarEvents } from "@/features/events/hooks/useCalendarEvents";
import { eventFromCalendarApi, eventFromCalendarClick } from "@/features/events/lib/calendarEventAdapter";
import { fromZonedTime } from "date-fns-tz";
import { torontoDate } from "@/app/utils/date";

const CALENDAR_PLUGINS = [
  themePlugin,
  dayGridPlugin,
  luxonFormatPlugin,
  rrulePlugin,
  interactionPlugin,
];

export default function EventsCalendar() {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarOccurrences, setCalendarOccurrences] = useState<Event[]>([]);
  const [eventBeingEdited, setEventBeingEdited] = useState<Event>();
  const [editedOccurrenceDate, setEditedOccurrenceDate] = useState<Date>();
  const [modalSession, setModalSession] = useState(0);
  const [isCalendarReady, setIsCalendarReady] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  const controller = useCalendarController();
  const { events, error, isLoading, changeRange, reload } = useCalendarEvents();

  const openEditModal = (event: Event) => {
    setModalSession((session) => session + 1);
    setEventBeingEdited(event);
    setEditedOccurrenceDate(new Date(event.start_date));
    modalRef.current?.showModal();
  };

  const openAddModal = () => {
    setModalSession((session) => session + 1);
    setEventBeingEdited(undefined);
    setEditedOccurrenceDate(undefined);
    modalRef.current?.showModal();
  };

  const closeModal = (
    shouldReload: boolean,
    focusDate?: Date,
    clearSelection = false,
  ) => {
    modalRef.current?.close();
    if (clearSelection) setSelectedDay(null);
    if (focusDate) controller.gotoDate(focusDate);
    if (shouldReload) {
      setIsCalendarReady(false);
      reload();
    }
  };

  const selectEvent = (info: EventClickInfo) => {
    const event = eventFromCalendarClick(info);
    setSelectedDay(torontoDate(event.start_date));
  };

  const selectedEvents = useMemo(() => {
    if (!selectedDay) return [];
    const dateStr = selectedDay;
    const start = fromZonedTime(`${dateStr}T00:00:00`, "America/Toronto");
    const nextDate = new Date(`${dateStr}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const nextDateStr = nextDate.toISOString().slice(0, 10);
    const end = fromZonedTime(`${nextDateStr}T00:00:00`, "America/Toronto");
    return calendarOccurrences
      .filter((event) => {
        const eventStart = new Date(event.start_date);
        const eventEnd = new Date(event.end_date);
        return eventStart < end && eventEnd > start;
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [calendarOccurrences, selectedDay]);

  const handleEventsSet = (eventApis: EventApi[]) => {
    setCalendarOccurrences(eventApis.map(eventFromCalendarApi));
  };

  // Fetch completion and FullCalendar's event-store update can land in
  // separate renders. Reveal only after the fetched source has committed and
  // the browser has completed a layout frame; this also works for empty data.
  useEffect(() => {
    if (isLoading || error) return;

    let revealFrame: number | undefined;
    const layoutFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => setIsCalendarReady(true));
    });

    return () => {
      cancelAnimationFrame(layoutFrame);
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
    };
  }, [error, events, isLoading]);

  const handleDateClick = (info: { dateStr: string }) =>
    setSelectedDay(info.dateStr.slice(0, 10));

  const handleRangeChange = (range: { start: Date; end: Date }) => {
    setIsCalendarReady(false);
    changeRange(range);
  };

  const handleRetry = () => {
    setIsCalendarReady(false);
    reload();
  };

  const isCalendarBusy = isLoading || (!error && !isCalendarReady);

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="w-full p-4">
        <CalendarToolbar controller={controller} onAdd={openAddModal} />

        {error && (
          <div
            role="alert"
            className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-coral/30 bg-coral-soft px-4 py-3 text-sm text-coral"
          >
            <span>{error}</span>
            <button
              type="button"
              className="shrink-0 font-semibold underline"
              onClick={handleRetry}
            >
              Retry
            </button>
          </div>
        )}

        {isCalendarReady && !isLoading && !error && events.length === 0 && (
          <EmptyCalendarState onAdd={openAddModal} />
        )}

        <div className="relative min-h-120" aria-busy={isCalendarBusy}>
          {isCalendarBusy && (
            <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-surface">
              <span
                className="loading loading-spinner loading-md text-teal"
                aria-label="Loading events"
              />
            </div>
          )}
          <FullCalendar
            controller={controller}
            plugins={CALENDAR_PLUGINS}
            initialView="dayGridMonth"
            timeZone="America/Toronto"
            fixedWeekCount={false}
            dayMaxEvents={3}
            events={events}
            eventClass="cursor-pointer"
            datesSet={handleRangeChange}
            eventClick={selectEvent}
            dateClick={handleDateClick}
            eventsSet={handleEventsSet}
          />
        </div>
      </div>

      <aside className="sticky top-18.25 flex w-full shrink-0 flex-col self-start overflow-hidden rounded-2xl border border-line bg-surface lg:w-87.5">
        <div className="border-b border-line px-5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
            {selectedEvents.length ? "Events on selected day" : "Events"}
          </p>
        </div>
        <EventDetailsPanel events={selectedEvents} onEdit={openEditModal} />
      </aside>

      <dialog ref={modalRef} className="modal">
        <EventModal
          key={modalSession}
          event={eventBeingEdited}
          occurrenceDate={editedOccurrenceDate}
          closeModal={closeModal}
        />
      </dialog>
    </div>
  );
}
