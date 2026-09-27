"use client";

import { useCan } from "@/store/hooks";
import { changeOccurrence } from "@/actions/events";
import type { BaseEvent, Occurrence, Schedule } from "../domain";
import { formatDateTimeLocal } from "@/app/utils/date";
import { useEventMutation } from "../hooks/useEventMutation";

export function SessionCard({
  event,
  occurrence,
  schedule,
  run,
  busy,
  onEdit,
  onSplit,
}: Readonly<{
  event: BaseEvent;
  occurrence: Occurrence;
  schedule?: Schedule;
  run: ReturnType<typeof useEventMutation>["run"];
  busy: boolean;
  onEdit: () => void;
  onSplit: () => void;
}>) {
  const canEdit = useCan("events.edit");
  function update(action: "reset" | "cancel" | "restore") {
    if (!confirm(`${action} this session?`)) return;
    void run(() =>
      changeOccurrence({
        event_id: event.id,
        id: occurrence.id,
        version: occurrence.version,
        action,
        cancelled: action === "cancel",
        request_id: crypto.randomUUID(),
      }),
    );
  }
  const cancelled = occurrence.cancelled || schedule?.cancelled;
  return (
    <article
      id={`occurrence-${occurrence.id}`}
      className="rounded-xl border border-line bg-surface p-4"
    >
      <p className="font-medium">
        {formatDateTimeLocal(occurrence.start_at).replace("T", " ")} —{" "}
        {formatDateTimeLocal(occurrence.end_at).replace("T", " ")}{" "}
        <span className="text-xs text-muted">Toronto</span>
      </p>
      <p className="text-sm text-muted">
        {schedule?.label || "Schedule"}
        {cancelled && " · Cancelled"}
        {occurrence.overridden && " · Individually edited"}
      </p>
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            disabled={busy}
            className="underline"
            onClick={onEdit}
          >
            Edit this session
          </button>
          {schedule?.recurrence && !schedule.cancelled && (
            <button
              type="button"
              disabled={busy}
              className="underline"
              onClick={onSplit}
            >
              This and following
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className="underline"
            onClick={() => update(occurrence.cancelled ? "restore" : "cancel")}
          >
            {occurrence.cancelled ? "Restore session" : "Cancel session"}
          </button>
          {occurrence.overridden && (
            <button
              type="button"
              disabled={busy}
              className="underline"
              onClick={() => update("reset")}
            >
              Reset exception
            </button>
          )}
        </div>
      )}
    </article>
  );
}
