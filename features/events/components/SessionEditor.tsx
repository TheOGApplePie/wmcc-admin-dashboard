"use client";

import { useState, type SubmitEvent } from "react";
import { changeOccurrence } from "@/actions/events";
import type { BaseEvent, Occurrence } from "../domain";
import { formatDateTimeLocal } from "@/app/utils/date";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { buttonClass, inputClass, utcInput } from "../lib/formUtilities";
import { useEventMutation } from "../hooks/useEventMutation";
import { Field } from "./Field";

export function SessionEditor({
  event,
  session,
  onClose,
}: Readonly<{
  event: BaseEvent;
  session: Occurrence;
  onClose: () => void;
}>) {
  const { run, busy, error } = useEventMutation();
  const [dirty, setDirty] = useState(false);
  const discard = useUnsavedChanges(dirty);
  const [timeError, setTimeError] = useState("");
  async function save(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setTimeError("");
    const form = new FormData(e.currentTarget);
    try {
      const start_at = utcInput(String(form.get("start")));
      const end_at = utcInput(String(form.get("end")));
      await run(
        () =>
          changeOccurrence({
            event_id: event.id,
            id: session.id,
            version: session.version,
            request_id: crypto.randomUUID(),
            action: "edit",
            start_at,
            end_at,
            cancelled: session.cancelled,
          }),
        () => {
          setDirty(false);
          onClose();
        },
      );
    } catch (error) {
      setTimeError(
        error instanceof Error ? error.message : "Enter valid Toronto times.",
      );
    }
  }
  return (
    <form
      onSubmit={save}
      onChange={() => setDirty(true)}
      className="space-y-3 rounded-xl border border-teal p-4"
      aria-busy={busy}
    >
      <h3>Edit one session</h3>
      <fieldset disabled={busy} className="space-y-3">
        <Field label="Start">
          <input
            className={inputClass}
            type="datetime-local"
            name="start"
            required
            defaultValue={formatDateTimeLocal(session.start_at)}
          />
        </Field>
        <Field label="End">
          <input
            className={inputClass}
            type="datetime-local"
            name="end"
            required
            defaultValue={formatDateTimeLocal(session.end_at)}
          />
        </Field>
        <button className={buttonClass}>
          {busy ? "Saving…" : "Save session"}
        </button>
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => {
            if (discard()) onClose();
          }}
        >
          Cancel
        </button>
      </fieldset>
      {busy && <p role="status">Saving session…</p>}
      {(error || timeError) && (
        <p role="alert" className="text-coral">
          {error || timeError}
        </p>
      )}
    </form>
  );
}
