"use client";
import type { ScheduleException } from "../server";

import { useState } from "react";
import Link from "next/link";
import { useCan } from "@/store/hooks";
import type { BaseEvent, Schedule } from "../domain";
import { BaseEventForm } from "./BaseEventForm";
import { EventActions } from "./EventActions";
import { buttonClass } from "../lib/formUtilities";
import { type Campaign, type Editor } from "../lib/eventManagement";
import { useEventMutation } from "../hooks/useEventMutation";
import { ScheduleCard } from "./ScheduleCard";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleExceptions } from "./ScheduleExceptions";

export default function EventManager({
  event,
  schedules,
  exceptions,
  campaign,
}: Readonly<{
  event: BaseEvent;
  schedules: Schedule[];
  exceptions: ScheduleException[];
  campaign: Campaign | null;
}>) {
  const canEdit = useCan("events.edit");
  const { run, busy, error } = useEventMutation();
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState<Editor | null>(null);
  const editorOpen = Boolean(editing || details);
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
            replacement={exceptions.some(
              (row) => row.replacement_schedule_id === schedule.id,
            )}
            onSplit={(date) => setEditing({ schedule, splitFrom: date })}
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
      <ScheduleExceptions
        event={event}
        schedules={schedules}
        exceptions={exceptions}
        busy={blocked}
        run={run}
      />
    </div>
  );
}
