"use client";
import { useEffect, useState } from "react";
import { useCan } from "@/store/hooks";
import { useNavigationGuard } from "@/features/navigation/UnsavedChangesProvider";
import type { ScheduleException } from "../server";
import type { BaseEvent, Schedule } from "../domain";
import type { Editor } from "../lib/eventManagement";
import { BaseEventForm } from "./BaseEventForm";
import { useEventMutation } from "../hooks/useEventMutation";
import { ScheduleCard } from "./ScheduleCard";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleExceptions } from "./ScheduleExceptions";

type ActiveEditor = Editor & { mode?: "date"; remainingCount?: number | null };
export default function EventManager({ event, schedules, exceptions }: Readonly<{
  event: BaseEvent; schedules: Schedule[]; exceptions: ScheduleException[];
}>) {
  const canEdit = useCan("events.edit");
  const { run, busy, error } = useEventMutation();
  const [editing, setEditing] = useState<ActiveEditor | null>(null);
  const guard = useNavigationGuard();
  const register = guard?.register;
  useEffect(() => {
    register?.("event-mutation", { dirty: false, busy, discard: () => {} });
    return () => register?.("event-mutation", null);
  }, [register, busy]);
  const blocked = busy || Boolean(guard?.busy);
  const switchEditor = (next: ActiveEditor | null) => {
    if (blocked) return;
    if (guard) guard.request(() => setEditing(next), ["schedule"]);
    else setEditing(next);
  };
  const close = () => setEditing(null);
  return <div className="space-y-8 sm:space-y-10" aria-busy={blocked}>
    <section aria-labelledby="event-details-heading" className="space-y-5">
      <h2 id="event-details-heading" className="text-lg font-semibold">Event details</h2>
      <BaseEventForm event={event} />
    </section>
    {error && <p role="alert" className="text-sm text-coral">{error}</p>}
    {busy && <p role="status">Saving changes…</p>}
    <section className="space-y-4 border-t border-line pt-8" aria-labelledby="schedules-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="schedules-heading" className="text-lg font-semibold">Schedules</h2>
        {canEdit && <button type="button" disabled={blocked} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-teal-dark hover:bg-teal-soft disabled:opacity-50" onClick={() => switchEditor({})}><span aria-hidden="true">+</span>Add schedule</button>}
      </div>
      {editing && !editing.schedule && <div className="rounded-xl border border-teal p-3">
        <ScheduleForm key="new" event={event} onClose={close} />
      </div>}
      {!schedules.length && <p className="text-sm text-muted">No schedules yet. Add a one-off session or a recurring schedule.</p>}
      {schedules.map((schedule) => {
        const expanded = editing?.schedule?.id === schedule.id;
        return <ScheduleCard key={schedule.id} event={event} schedule={schedule} run={run}
          busy={blocked} otherEditorOpen={Boolean(editing)} expanded={expanded && editing.mode !== "date"}
          onEdit={() => switchEditor(expanded && editing.mode !== "date" ? null : { schedule })}
          dateOpen={expanded && editing.mode === "date"}
          onDateEdit={() => switchEditor(expanded && editing.mode === "date" ? null : { schedule, mode: "date" })}
          onDateClose={close}
          replacement={exceptions.some((row) => row.replacement_schedule_id === schedule.id)}
          onSplit={(date, remainingCount) => setEditing({ schedule, splitFrom: date, remainingCount })}>
          {expanded && editing.mode !== "date" && <ScheduleForm
            key={`${schedule.id}:${editing.splitFrom ?? "all"}`} event={event} schedule={schedule}
            splitFrom={editing.splitFrom} remainingCount={editing.remainingCount} onClose={close} />}
        </ScheduleCard>;
      })}
    </section>
    <ScheduleExceptions event={event} schedules={schedules} exceptions={exceptions} busy={blocked || Boolean(editing)} run={run} />
  </div>;
}
