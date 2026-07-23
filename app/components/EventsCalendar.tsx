"use client";
import { useEffect, useRef, useState } from "react";
import { type Event } from "@/app/schemas/events";
import { fetchAllEvents } from "@/actions/events";
import EventModal from "./eventModal";
import { Badge } from "@/app/components/ui/Badge";
import FullCalendar, {
  CalendarRef,
  EventClickInfo,
  EventInput,
  useCalendarController,
} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import themePlugin from "@fullcalendar/react/themes/classic";
import luxonFormatPlugin from "@fullcalendar/format-luxon3";
import rrulePlugin from "@fullcalendar/rrule";
import interactionPlugin from "@fullcalendar/react/interaction";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import { Btn } from "./ui/Btn";
import Loading from "../dashboard/posts/loading";

function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  });
}

interface EventDetailPanelProps {
  event: Event | null;
  onEdit: (occ: Event) => void;
  onAdd: () => void;
}

function EventDetailPanel({ event, onEdit }: Readonly<EventDetailPanelProps>) {
  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full opacity-40 py-12">
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M8 2v3M16 2v3M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
        <p className="text-[13px] text-center">Click an event to see details</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-bold leading-snug">{event.title}</h3>
          {event.is_recurring && (
            <Badge variant="teal" className="mt-1">
              Recurring
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 text-[13px]">
        <div>
          <p className="text-[11px] text-muted mb-0.5">Start</p>
          <p>{fmtDateTime(event.start_date)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted mb-0.5">End</p>
          <p>{fmtDateTime(event.end_date)}</p>
        </div>
        {event.location && (
          <div>
            <p className="text-[11px] text-muted mb-0.5">Location</p>
            <p>{event.location}</p>
          </div>
        )}

        {event.description && (
          <div>
            <p className="text-[11px] text-muted mb-0.5">Description</p>
            <p className="leading-relaxed text-ink/80 whitespace-pre-wrap">
              {event.description}
            </p>
          </div>
        )}
      </div>

      {event.call_to_action_link && (
        <a
          href={event.call_to_action_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-teal hover:text-teal-dark transition-colors"
        >
          {event.call_to_action_caption || "Learn More"} →
        </a>
      )}

      <button
        className="mt-auto w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors bg-teal-soft hover:bg-teal/20 text-teal-dark"
        onClick={() => onEdit(event)}
      >
        Edit / Manage
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EventsCalendar() {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [selectedOcc, setSelectedOcc] = useState<Event | null>(null);
  const [datesSet, setDatesSet] = useState<{ start: Date; end: Date } | null>(
    null,
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const editModalRef = useRef<HTMLDialogElement>(null);

  const [editEvent, setEditEvent] = useState<Event | undefined>(undefined);
  const [editOccDate, setEditOccDate] = useState<Date | undefined>(undefined);

  const [loadKey, setLoadKey] = useState(0);
  const reloadEvents = () => setLoadKey((k) => k + 1);
  const calendarRef = useRef<CalendarRef | null>(null);
  const fetchData = async () => {
    if (!datesSet) return;
    setCalendarLoading(true);
    const fetchedEvents = await fetchAllEvents({
      rangeStart: datesSet.start,
      rangeEnd: datesSet.end,
    });

    const data = Array.isArray(fetchedEvents.data) ? fetchedEvents.data : [];
    setEvents(data);
  };

  useEffect(() => {
    fetchData();
  }, [loadKey, datesSet]);

  const openEdit = (occ: Event) => {
    setEditEvent(occ);
    setSelectedOcc(occ);
    editModalRef.current?.showModal();
  };

  const openAdd = () => {
    setEditEvent(undefined);
    setEditOccDate(undefined);
    editModalRef.current?.showModal();
  };

  const handleClose = (reload: boolean) => {
    editModalRef.current?.close();
    if (reload) reloadEvents();
  };
  const handleDatesSet = (args: { start: Date; end: Date }) => {
    setDatesSet(args);
  };
  const handleEventClick = (info: EventClickInfo) => {
    setSelectedOcc({
      id: info.event.extendedProps.id,
      title: info.event.title,
      description: info.event.extendedProps.description,
      location: info.event.extendedProps.location,
      poster_url: info.event.extendedProps.poster_url,
      poster_file: info.event.extendedProps.poster_file,
      poster_alt: info.event.extendedProps.poster_alt,
      call_to_action_link: info.event.extendedProps.call_to_action_link,
      call_to_action_caption: info.event.extendedProps.call_to_action_caption,
      action: info.event.extendedProps.action,
      gallery_url: info.event.extendedProps.gallery_url,
      navigation_slug: info.event.extendedProps.navigation_slug,
      is_recurring: !!info.event.extendedProps.recurrence_rule,
      recurrence_rule: info.event.extendedProps.recurrence_rule ?? undefined,
      recurrence_rule_id: info.event.extendedProps.recurrence_rule?.id,
      start_date: info.event.start as Date,
      end_date: info.event.end as Date,
    });
  };
  const controller = useCalendarController();
  const buttons = controller.getButtonState();

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      <div className="p-4 w-full">
        <div className="flex justify-between py-4">
          <div className="flex gap-3">
            <Btn
              className="btn border-0"
              variant="soft"
              size="lg"
              onClick={() => controller.prev()}
              disabled={buttons.prev.isDisabled}
              aria-label={buttons.prev.hint}
            >
              {buttons.prev.text}
            </Btn>
            <Btn
              variant="dark"
              className="btn border-0"
              size="lg"
              onClick={() => controller.today()}
              disabled={buttons.today.isDisabled}
              aria-label={buttons.today.hint}
            >
              {buttons.today.text}
            </Btn>
            <Btn
              variant="soft"
              size="lg"
              className="btn border-0"
              onClick={() => controller.next()}
              disabled={buttons.next.isDisabled}
              aria-label={buttons.next.hint}
            >
              {buttons.next.text}
            </Btn>
          </div>
          <div className="toolbar-title">{controller.view?.title}</div>
          <div>
            <Btn className="btn border-0" onClick={() => openAdd()}>
              Add Event
            </Btn>
          </div>
        </div>
        <FullCalendar
          ref={calendarRef}
          controller={controller}
          plugins={[
            themePlugin,
            dayGridPlugin,
            luxonFormatPlugin,
            rrulePlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          events={events}
          eventClass={"hover:cursor-pointer"}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
        />
      </div>
      {/* ── Detail panel ──────────────────────────────────────────────── */}
      <div className="w-full lg:w-87.5 shrink-0 bg-surface border border-line rounded-2xl overflow-hidden flex flex-col sticky top-18.25 self-start">
        <div className="px-5 py-3 border-b border-line">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-wide">
            {selectedOcc ? "Event Details" : "Events"}
          </p>
        </div>
        <EventDetailPanel
          event={selectedOcc}
          onEdit={openEdit}
          onAdd={openAdd}
        />
      </div>

      {/* ── Event modal (unchanged) ────────────────────────────────────── */}
      <dialog ref={editModalRef} className="modal">
        <EventModal
          event={editEvent}
          occurrenceDate={editOccDate}
          closeModal={handleClose}
        />
      </dialog>
    </div>
  );
}
