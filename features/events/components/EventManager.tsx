"use client";
import { EVENT_LIST_PAGE_SIZE } from "../constants";


import { useState } from "react";
import Link from "next/link";
import { useCan } from "@/store/hooks";
import type { BaseEvent, Occurrence, Schedule } from "../domain";
import { BaseEventForm } from "./BaseEventForm";
import { EventActions } from "./EventActions";
import { buttonClass, inputClass } from "../lib/formUtilities";
import {
  matchesFilter,
  splitEditor,
  type Campaign,
  type Editor,
} from "../lib/eventManagement";
import { useEventMutation } from "../hooks/useEventMutation";
import { ScheduleCard } from "./ScheduleCard";
import { ScheduleForm } from "./ScheduleForm";
import { SessionCard } from "./SessionCard";
import { SessionEditor } from "./SessionEditor";

export default function EventManager({
  event,
  schedules,
  occurrences,
  campaign,
}: Readonly<{
  event: BaseEvent;
  schedules: Schedule[];
  occurrences: Occurrence[];
  campaign: Campaign | null;
}>) {
  const canEdit = useCan("events.edit");
  const { run, busy, error } = useEventMutation();
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState<Editor | null>(null);
  const [session, setSession] = useState<Occurrence | null>(null);
  const [filter, setFilter] = useState("upcoming");
  const [page, setPage] = useState(0);
  const [now] = useState(() => Date.now());
  const scheduleMap = new Map(
    schedules.map((schedule) => [schedule.id, schedule]),
  );
  const visible = occurrences.filter((row) =>
    matchesFilter(row, scheduleMap.get(row.schedule_id), filter, now),
  );
  const editorOpen = Boolean(editing || session || details);
  const blocked = busy || editorOpen;
  return (
    <div className="space-y-6" aria-busy={busy}>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/events" className="text-sm underline">
          Back to calendar
        </Link>
        <Link href="/dashboard/events/library" className="text-sm underline">
          All events
        </Link>
        <span className="rounded-full bg-teal-soft px-3 py-1 text-sm capitalize">
          {event.publication_status}
        </span>
      </div>
      <EventActions
        event={event}
        campaign={campaign}
        run={run}
        busy={blocked}
        details={details}
        onDetails={() => setDetails(true)}
      />
      {event.publication_status !== "published" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm">
          This event is not public. A linked campaign can be prepared, but
          cannot activate or publish posts. Publishing this event will not
          activate its campaign.
        </p>
      )}
      {busy && <p role="status">Saving changes…</p>}
      {error && (
        <p role="alert" className="text-coral">
          {error}
        </p>
      )}
      {details ? (
        <BaseEventForm
          key={event.version}
          event={event}
          onClose={() => setDetails(false)}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm">{event.description}</p>
      )}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Schedules</h2>
          {canEdit && (
            <button
              type="button"
              disabled={blocked}
              className={buttonClass}
              onClick={() => setEditing({})}
            >
              Add schedule
            </button>
          )}
        </div>
        {!schedules.length && (
          <p className="text-sm text-muted">
            No schedules yet. Add a one-off session or a recurring schedule.
          </p>
        )}
        {schedules.map((schedule) => (
          <ScheduleCard
            key={schedule.id}
            event={event}
            schedule={schedule}
            run={run}
            busy={blocked}
            onEdit={() => setEditing({ schedule })}
          />
        ))}
        {editing && (
          <ScheduleForm
            key={`${editing.schedule?.id ?? "new"}-${editing.splitFrom ?? "all"}`}
            event={event}
            schedule={editing.schedule}
            splitFrom={editing.splitFrom}
            onClose={() => setEditing(null)}
          />
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <select
          aria-label="Filter sessions"
          className={inputClass}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="upcoming">Upcoming and happening now</option>
          <option value="past">Past</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All sessions</option>
        </select>
        {!visible.length && (
          <p className="text-sm text-muted">No sessions match this filter.</p>
        )}
        {visible.slice(page * EVENT_LIST_PAGE_SIZE, page * EVENT_LIST_PAGE_SIZE + EVENT_LIST_PAGE_SIZE).map((row) => (
          <SessionCard
            key={row.id}
            event={event}
            occurrence={row}
            schedule={scheduleMap.get(row.schedule_id)}
            run={run}
            busy={blocked}
            onEdit={() => setSession(row)}
            onSplit={() => {
              const schedule = scheduleMap.get(row.schedule_id);
              if (schedule) setEditing(splitEditor(schedule, row, occurrences));
            }}
          />
        ))}
        {visible.length > EVENT_LIST_PAGE_SIZE && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              {page + 1} / {Math.ceil(visible.length / EVENT_LIST_PAGE_SIZE)}
            </span>
            <button
              type="button"
              disabled={(page + 1) * EVENT_LIST_PAGE_SIZE >= visible.length}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        )}
        {session && (
          <SessionEditor
            key={session.id}
            event={event}
            session={session}
            onClose={() => setSession(null)}
          />
        )}
      </section>
    </div>
  );
}
