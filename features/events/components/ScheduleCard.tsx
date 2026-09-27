"use client";

import { useCan } from "@/store/hooks";
import { changeScheduleState } from "@/actions/events";
import type { BaseEvent, Schedule } from "../domain";
import { useEventMutation } from "../hooks/useEventMutation";

export function ScheduleCard({
  event,
  schedule,
  run,
  busy,
  onEdit,
}: Readonly<{
  event: BaseEvent;
  schedule: Schedule;
  run: ReturnType<typeof useEventMutation>["run"];
  busy: boolean;
  onEdit: () => void;
}>) {
  const canEdit = useCan("events.edit");
  function toggle() {
    const verb = schedule.cancelled ? "Restore" : "Cancel";
    if (
      !confirm(`${verb} this schedule? Linked campaign posts will need review.`)
    )
      return;
    void run(() =>
      changeScheduleState({
        event_id: event.id,
        id: schedule.id,
        version: schedule.version,
        cancelled: !schedule.cancelled,
        request_id: crypto.randomUUID(),
      }),
    );
  }
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h3 className="font-semibold">
          {schedule.label || "Untitled schedule"}
          {schedule.cancelled && " · Cancelled"}
        </h3>
        <p className="text-sm text-muted">
          {schedule.recurrence
            ? `Repeats ${schedule.recurrence.frequency}`
            : "One session"}{" "}
          · {schedule.poster_url ? "Own poster" : "Uses event poster"}
        </p>
        {schedule.materialized_version !== schedule.version && (
          <p role="alert" className="text-sm text-coral">
            This schedule needs generation or repair before it can appear in the
            calendar.
          </p>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-3">
          <button
            type="button"
            className="text-sm underline"
            disabled={busy}
            onClick={onEdit}
          >
            Edit schedule
          </button>
          <button
            type="button"
            className="text-sm underline"
            disabled={busy}
            onClick={toggle}
          >
            {schedule.cancelled ? "Restore" : "Cancel schedule"}
          </button>
        </div>
      )}
    </article>
  );
}
