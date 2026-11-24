"use client";
import { useRef, useState, type SubmitEvent } from "react";
import { changeScheduleException, inspectScheduleDate } from "@/actions/events";
import { type BaseEvent, type Schedule } from "../domain";
import { useEventMutation } from "../hooks/useEventMutation";
import { inputClass, buttonClass, utcInput } from "../lib/formUtilities";
import { useRequestId } from "../hooks/useRequestId";
import { useTrackedForm } from "../hooks/useTrackedForm";
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
  onSplit: (date: string, remainingCount: number | null) => void;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const requestId = useRequestId();
  const [inspecting, setInspecting] = useState(false);
  const tracked = useTrackedForm("schedule", formRef, inspecting, onClose);
  const [action, setAction] = useState("cancel");
  const [error, setError] = useState("");
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tracked.blocked) return;
    const form = new FormData(e.currentTarget);
    const date = String(form.get("date"));
    setError("");
    try {
      if (action === "split") {
        setInspecting(true);
        const result = await inspectScheduleDate({ event_id: event.id, id: schedule.id, version: schedule.version, date });
        if (!result?.data?.data || result.data.error) throw new Error(result?.data?.error || result?.serverError || "Could not validate the date.");
        tracked.commit(); onSplit(date, result.data.data.remainingCount); return;
      }
      const payload = {
        event_id: event.id, id: schedule.id, version: schedule.version, original_date: date,
        action: action as "edit" | "cancel",
        start_at: action === "edit" ? utcInput(String(form.get("start"))) : undefined,
        end_at: action === "edit" ? utcInput(String(form.get("end"))) : undefined,
      };
      await run(() => changeScheduleException({ ...payload, request_id: requestId(payload) }), () => { tracked.commit(); onClose(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check the dates.");
    } finally { setInspecting(false); }
  }
  return (
    <form ref={formRef} onSubmit={submit} onChange={tracked.changed} className="space-y-3 border-t border-line pt-3">
      <fieldset disabled={busy || inspecting} className="space-y-3">
        <Field label="Original date (Toronto)">
          <input name="date" type="date" required className={inputClass} />
        </Field>
        <Field label="Change">
          <select
            className={inputClass}
            name="action"
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
        <button type="button" className="ml-3 underline" onClick={() => { tracked.cancel(onClose); }}>
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
