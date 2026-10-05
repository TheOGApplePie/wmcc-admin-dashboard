"use client";
import { useState, type SubmitEvent } from "react";
import { changeScheduleException } from "@/actions/events";
import { scheduleDateIndex, type BaseEvent, type Schedule } from "../domain";
import { useEventMutation } from "../hooks/useEventMutation";
import { inputClass, buttonClass, utcInput } from "../lib/formUtilities";
import { useRequestId } from "../hooks/useRequestId";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { Field } from "./Field";
export function ScheduleDateForm({
  event,
  schedule,
  busy,
  run,
  onClose,
  onSplit,
}: Readonly<{
  event: BaseEvent;
  schedule: Schedule;
  busy: boolean;
  run: ReturnType<typeof useEventMutation>["run"];
  onClose: () => void;
  onSplit: (date: string) => void;
}>) {
  const requestId = useRequestId();
  const [dirty, setDirty] = useState(false);
  const discard = useUnsavedChanges(dirty);
  const [action, setAction] = useState("cancel");
  const [error, setError] = useState("");
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const date = String(form.get("date"));
    setError("");
    try {
      scheduleDateIndex(schedule, date);
      if (action === "split") { onClose(); onSplit(date); return; }
      const payload = {
        event_id: event.id, id: schedule.id, version: schedule.version, original_date: date,
        action: action as "edit" | "cancel",
        start_at: action === "edit" ? utcInput(String(form.get("start"))) : undefined,
        end_at: action === "edit" ? utcInput(String(form.get("end"))) : undefined,
      };
      await run(() => changeScheduleException({ ...payload, request_id: requestId(payload) }), () => { setDirty(false); onClose(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check the dates.");
    }
  }
  return (
    <form onSubmit={submit} onChange={() => setDirty(true)} className="space-y-3 border-t border-line pt-3">
      <fieldset disabled={busy} className="space-y-3">
        <Field label="Original date (Toronto)">
          <input name="date" type="date" required className={inputClass} />
        </Field>
        <Field label="Change">
          <select
            className={inputClass}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="cancel">Exclude this date</option>
            <option value="edit">Move this date</option>
            <option value="split">Change this and following</option>
          </select>
        </Field>
        {action === "edit" && (
          <>
            <Field label="Replacement start (Toronto)">
              <input
                name="start"
                type="datetime-local"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Replacement end (Toronto)">
              <input
                name="end"
                type="datetime-local"
                required
                className={inputClass}
              />
            </Field>
          </>
        )}
        <p className="text-sm text-muted">
          A replacement is a separate schedule. Its details can be edited after
          saving.
        </p>
        <button className={buttonClass}>
          {action === "split" ? "Edit following schedule" : "Save change"}
        </button>
        <button type="button" className="ml-3 underline" onClick={() => { if (discard()) onClose(); }}>
          Cancel
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-coral">
          {error}
        </p>
      )}
    </form>
  );
}
