"use client";
import { useState } from "react";
import { useCan } from "@/store/hooks";
import { removeEventSchedule } from "@/actions/events";
import type { BaseEvent, Schedule } from "../domain";
import { useEventMutation } from "../hooks/useEventMutation";
import { ScheduleDateForm } from "./ScheduleDateForm";
import { formatTorontoDateTime } from "@/app/utils/date";

export function ScheduleCard({
  event,
  schedule,
  run,
  busy,
  onEdit,
  replacement,
  onSplit,
  children, expanded, dateOpen, onDateEdit, onDateClose, otherEditorOpen,
}: Readonly<{
  event: BaseEvent;
  schedule: Schedule;
  run: ReturnType<typeof useEventMutation>["run"];
  busy: boolean;
  onEdit: () => void;
  replacement: boolean;
  onSplit: (date: string, remainingCount: number | null) => void;
  children?: React.ReactNode;
  expanded: boolean;
  dateOpen: boolean;
  onDateEdit: () => void;
  onDateClose: () => void;
  otherEditorOpen: boolean;
}>) {
  const canEdit = useCan("events.edit");
  const [removing, setRemoving] = useState(false);
  const [restore, setRestore] = useState(false);
  function remove() {
    void run(() =>
      removeEventSchedule({
        event_id: event.id,
        id: schedule.id,
        version: schedule.version,
        restore_original: restore,
        request_id: crypto.randomUUID(),
      }),
    );
  }
  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h3 className="font-semibold">{schedule.label || "Untitled schedule"}</h3>
      <p className="text-sm text-muted">
        {formatTorontoDateTime(schedule.start_at)} ·{" "}
        {schedule.recurrence_rule
          ? `Repeats ${schedule.recurrence_rule.frequency}`
          : "One date"}
      </p>
      {canEdit && (
        <div className="flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            disabled={busy || removing}
            className="underline"
            aria-label={`${expanded ? "Collapse editor" : "Edit schedule"}: ${schedule.label || "Untitled schedule"}`}
            aria-expanded={expanded}
            aria-controls={`schedule-editor-${schedule.id}`}
            onClick={onEdit}
          >
            {expanded ? "Collapse editor" : "Edit schedule"}
          </button>
          {schedule.recurrence_rule && (
            <button
              type="button"
              disabled={busy || removing}
              className="underline"
              aria-expanded={dateOpen}
              aria-controls={`schedule-date-${schedule.id}`}
              onClick={onDateEdit}
            >
              Change one date
            </button>
          )}
          <button
            type="button"
            disabled={busy || otherEditorOpen}
            className="underline"
            onClick={() => setRemoving(true)}
          >
            Remove schedule
          </button>
        </div>
      )}
      <div id={`schedule-editor-${schedule.id}`} hidden={!expanded}>{children}</div>
      {dateOpen && (
        <div id={`schedule-date-${schedule.id}`}><ScheduleDateForm
          event={event}
          schedule={schedule}
          busy={busy}
          run={run}
          onClose={onDateClose}
          onSplit={onSplit}
        /></div>
      )}
      {removing && (
        <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm">
          <p>Remove this schedule? Linked campaign posts will need review.</p>
          {replacement && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={busy || otherEditorOpen}
                checked={restore}
                onChange={(e) => setRestore(e.target.checked)}
              />
              Also restore the original excluded date
            </label>
          )}
          <button
            type="button"
            disabled={busy || otherEditorOpen}
            className="mr-3 underline"
            onClick={remove}
          >
            Remove schedule
          </button>
          <button
            type="button"
            disabled={busy}
            className="underline"
            onClick={() => setRemoving(false)}
          >
            Keep schedule
          </button>
        </div>
      )}
    </article>
  );
}
