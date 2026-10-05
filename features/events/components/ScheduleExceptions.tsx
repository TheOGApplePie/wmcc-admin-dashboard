"use client";
import { useCan } from "@/store/hooks";
import { changeScheduleException } from "@/actions/events";
import type { BaseEvent, Schedule } from "../domain";
import type { ScheduleException } from "../server";
import { useEventMutation } from "../hooks/useEventMutation";
export function ScheduleExceptions({
  event,
  schedules,
  exceptions,
  busy,
  run,
}: Readonly<{
  event: BaseEvent;
  schedules: Schedule[];
  exceptions: ScheduleException[];
  busy: boolean;
  run: ReturnType<typeof useEventMutation>["run"];
}>) {
  const canEdit = useCan("events.edit");
  const excluded = schedules.flatMap((schedule) =>
    (schedule.recurrence_rule?.exdates ?? []).map((date) => ({
      schedule,
      date,
    })),
  );
  function restore(schedule: Schedule, date: string, replacement: boolean) {
    const message = replacement
      ? "Restore the original date and remove its replacement schedule?"
      : "Restore this excluded date?";
    if (!confirm(message)) return;
    void run(() =>
      changeScheduleException({
        event_id: event.id,
        id: schedule.id,
        version: schedule.version,
        original_date: date,
        action: "restore",
        request_id: crypto.randomUUID(),
      }),
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Excluded dates</h2>
      {!excluded.length && (
        <p className="text-sm text-muted">No excluded dates.</p>
      )}
      {excluded.map(({ schedule, date }) => {
        const replacement = exceptions.find(
          (row) =>
            row.source_schedule_id === schedule.id &&
            row.excluded_date === date,
        )?.replacement_schedule_id;
        return (
          <div
            key={`${schedule.id}:${date}`}
            className="flex items-center justify-between rounded-xl border border-line p-3 text-sm"
          >
            <span>
              {date} � {schedule.label || "Schedule"}
              {replacement && " � Has replacement schedule"}
            </span>
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                className="underline"
                onClick={() => restore(schedule, date, Boolean(replacement))}
              >
                Restore date
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
