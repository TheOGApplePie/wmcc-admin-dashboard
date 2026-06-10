"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Event } from "@/app/schemas/events";
import { fetchAllEvents } from "@/actions/events";
import EventModal from "./eventModal";
import { Badge } from "@/app/components/ui/Badge";
import { type Occurrence, expandEventsToRange, toEstDay } from "@/utils/expandEvents";

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
] as const;

function buildGridCells(year: number, month: number): Date[] {
  const cells: Date[] = [];
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  for (let i = firstDow; i > 0; i--)  cells.push(new Date(Date.UTC(year, month, 1 - i)));
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(Date.UTC(year, month, d)));
  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= tail; i++)      cells.push(new Date(Date.UTC(year, month + 1, i)));

  return cells;
}


function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-CA", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "America/Toronto",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface EventChipProps {
  event: Event;
  isSelected: boolean;
  onClick: () => void;
}

function EventChip({ event, isSelected, onClick }: Readonly<EventChipProps>) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left truncate text-[10px] rounded px-1 py-0.5 font-medium transition-colors ${
        isSelected
          ? "bg-teal text-white"
          : "bg-teal-soft text-teal-dark hover:bg-teal/20"
      }`}
      title={event.title}
    >
      {event.title}
    </button>
  );
}

interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  occurrences: Occurrence[];
  selectedOccurrence: Occurrence | null;
  onDayClick: (date: Date) => void;
  onEventClick: (occ: Occurrence) => void;
}

function DayCell({
  date, isCurrentMonth, isToday, isSelected,
  occurrences, selectedOccurrence, onDayClick, onEventClick,
}: Readonly<DayCellProps>) {
  return (
    <div
      className={`min-h-24 p-1.5 border-b border-r border-line cursor-pointer transition-colors ${
        isCurrentMonth ? "bg-surface hover:bg-canvas" : "bg-canvas/50"
      } ${isSelected ? "ring-1 ring-inset ring-teal" : ""}`}
      onClick={() => onDayClick(date)}
    >
      <div className="flex justify-end mb-1">
        <span
          className={`text-[12px] font-medium w-6 h-6 flex items-center justify-center rounded-full ${
            isToday
              ? "bg-teal text-white font-bold"
              : isCurrentMonth
              ? "text-ink"
              : "text-muted"
          }`}
        >
          {date.getUTCDate()}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {occurrences.slice(0, 3).map((occ) => (
          <EventChip
            key={occ.event.id + isoDate(occ.occurrenceDate)}
            event={occ.event}
            isSelected={selectedOccurrence?.event.id === occ.event.id &&
              isoDate(selectedOccurrence.occurrenceDate) === isoDate(occ.occurrenceDate)}
            onClick={() => onEventClick(occ)}
          />
        ))}
        {occurrences.length > 3 && (
          <span className="text-[10px] text-muted px-1">+{occurrences.length - 3} more</span>
        )}
      </div>
    </div>
  );
}

interface EventDetailPanelProps {
  selected: Occurrence | null;
  selectedDay: Date | null;
  dayOccurrences: Occurrence[];
  onEdit: (occ: Occurrence) => void;
  onAdd: () => void;
}

function EventDetailPanel({
  selected, selectedDay, dayOccurrences, onEdit, onAdd,
}: Readonly<EventDetailPanelProps>) {
  if (!selectedDay && !selected) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full opacity-40 py-12">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 2v3M16 2v3M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
        <p className="text-[13px] text-center">Click a day or event to see details</p>
      </div>
    );
  }

  if (selected) {
    const { event, occurrenceDate } = selected;
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-bold leading-snug">{event.title}</h3>
            {event.is_recurring && (
              <Badge variant="teal" className="mt-1">Recurring</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 text-[13px]">
          <Row label="Start" value={fmtDateTime(event.start_date)} />
          <Row label="End" value={fmtDateTime(event.end_date)} />
          {event.location && <Row label="Location" value={event.location} />}
          {event.is_recurring && (
            <Row label="Occurrence" value={occurrenceDate.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} />
          )}
          {event.description && (
            <div>
              <p className="text-[11px] text-muted mb-0.5">Description</p>
              <p className="leading-relaxed text-ink/80">{event.description}</p>
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
          onClick={() => onEdit(selected)}
        >
          Edit / Manage
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      <p className="text-[12px] font-semibold text-muted uppercase tracking-wide">
        {selectedDay?.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
      </p>
      {dayOccurrences.length === 0 ? (
        <p className="text-[13px] text-muted">No events this day.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dayOccurrences.map((occ) => (
            <li key={occ.event.id}>
              <button
                className="w-full text-left rounded-xl border border-line p-3 hover:border-teal/30 hover:bg-teal-soft/30 transition-colors"
                onClick={() => onEdit(occ)}
              >
                <p className="text-[13px] font-semibold">{occ.event.title}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {fmtDateTime(occ.event.start_date)}
                  {occ.event.location ? ` · ${occ.event.location}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white bg-teal hover:bg-teal-dark shadow-[0_8px_18px_-8px_rgba(15,128,115,.8)] transition-colors"
        onClick={onAdd}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Event
      </button>
    </div>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-[11px] text-muted mb-0.5">{label}</p>
      <p>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EventsCalendar() {
  const today = useMemo(() => toEstDay(new Date()), []);
  const [viewYear, setViewYear]       = useState(today.getUTCFullYear());
  const [viewMonth, setViewMonth]     = useState(today.getUTCMonth());
  const [events, setEvents]           = useState<Event[]>([]);
  const [selectedOcc, setSelectedOcc] = useState<Occurrence | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const editModalRef = useRef<HTMLDialogElement>(null);

  const [editEvent, setEditEvent] = useState<Event | undefined>(undefined);
  const [editOccDate, setEditOccDate] = useState<Date | undefined>(undefined);

  const [loadKey, setLoadKey] = useState(0);
  const reloadEvents = () => setLoadKey((k) => k + 1);

  useEffect(() => {
    fetchAllEvents({}).then((result) => {
      if (result?.data?.data) setEvents(result.data.data);
    });
  }, [loadKey]);

  const cells = useMemo(() => buildGridCells(viewYear, viewMonth), [viewYear, viewMonth]);

  const rangeFrom = cells[0];
  const rangeTo   = cells[cells.length - 1];

  const occurrencesByDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const occ of expandEventsToRange(events, rangeFrom, rangeTo)) {
      const key = isoDate(occ.occurrenceDate);
      const list = map.get(key) ?? [];
      list.push(occ);
      map.set(key, list);
    }
    return map;
  }, [events, rangeFrom, rangeTo]);

  const dayOccs = selectedDay
    ? (occurrencesByDay.get(isoDate(selectedDay)) ?? [])
    : [];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };
  const goToday = () => {
    setViewYear(today.getUTCFullYear());
    setViewMonth(today.getUTCMonth());
  };

  const openEdit = (occ: Occurrence) => {
    setEditEvent(occ.event);
    setEditOccDate(occ.occurrenceDate);
    setSelectedOcc(occ);
    editModalRef.current?.showModal();
  };

  const openAdd = () => {
    setEditEvent(undefined);
    setEditOccDate(undefined);
    editModalRef.current?.showModal();
  };

  const handleDayClick = (date: Date) => {
    setSelectedDay(date);
    setSelectedOcc(null);
  };

  const handleClose = (reload: boolean) => {
    editModalRef.current?.close();
    if (reload) reloadEvents();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full">
      {/* ── Calendar grid ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-surface border border-line rounded-2xl overflow-hidden flex flex-col">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink transition-colors"
              aria-label="Previous month"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink transition-colors"
              aria-label="Next month"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <h2 className="ml-1 text-[16px] font-bold">
              {MONTHS[viewMonth]} {viewYear}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="px-3 py-1 text-[12px] font-medium rounded-lg border border-line hover:border-teal hover:text-teal transition-colors"
            >
              Today
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white rounded-lg bg-teal hover:bg-teal-dark shadow-[0_4px_10px_-4px_rgba(15,128,115,.7)] transition-colors"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Event
            </button>
          </div>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-line">
          {DAYS.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Cells grid */}
        <div className="grid grid-cols-7 flex-1">
          {cells.map((date) => {
            const key = isoDate(date);
            return (
              <DayCell
                key={key}
                date={date}
                isCurrentMonth={date.getUTCMonth() === viewMonth}
                isToday={key === isoDate(today)}
                isSelected={selectedDay ? key === isoDate(selectedDay) : false}
                occurrences={occurrencesByDay.get(key) ?? []}
                selectedOccurrence={selectedOcc}
                onDayClick={handleDayClick}
                onEventClick={(occ) => { setSelectedOcc(occ); setSelectedDay(null); }}
              />
            );
          })}
        </div>
      </div>

      {/* ── Detail panel ──────────────────────────────────────────────── */}
      <div className="w-full lg:w-[280px] shrink-0 bg-surface border border-line rounded-2xl overflow-hidden flex flex-col sticky top-[73px] self-start">
        <div className="px-5 py-3 border-b border-line">
          <p className="text-[12px] font-semibold text-muted uppercase tracking-wide">
            {selectedOcc ? "Event Details" : selectedDay ? "Day" : "Events"}
          </p>
        </div>
        <EventDetailPanel
          selected={selectedOcc}
          selectedDay={selectedDay}
          dayOccurrences={dayOccs}
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
