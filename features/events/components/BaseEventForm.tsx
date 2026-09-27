"use client";
import { EVENT_FIELD_LIMITS } from "@/features/events/constants";

import { useRequestId } from "../hooks/useRequestId";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveBaseEvent } from "@/actions/events";
import { baseFields } from "../schemas";
import { type BaseEvent } from "../domain";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import {
  assertResponse,
  buttonClass,
  errorMessage,
  inputClass,
  nullable,
  submitLabel,
  value,
} from "../lib/formUtilities";
import { Field } from "./Field";
import { PosterFields } from "./PosterFields";

export function BaseEventForm({
  event,
  onClose,
}: Readonly<{
  event?: BaseEvent;
  onClose?: () => void;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const discard = useUnsavedChanges(dirty);
  const requestId = useRequestId();
  async function save(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading) return;
    setError("");
    setBusy(true);
    try {
      const form = new FormData(e.currentTarget);
      const fields = baseFields.parse({
        title: value(form, "title"),
        description: value(form, "description"),
        location: value(form, "location"),
        navigation_slug: value(form, "navigation_slug"),
        poster_url: nullable(form, "poster_url"),
        poster_alt: value(form, "poster_alt"),
        call_to_action_link: nullable(form, "call_to_action_link"),
        call_to_action_caption: nullable(form, "call_to_action_caption"),
        gallery_url: nullable(form, "gallery_url"),
      });
      const payload = { id: event?.id, version: event?.version, fields };
      const result = await saveBaseEvent({
        ...payload,
        request_id: requestId(payload),
      });
      assertResponse(result);
      setDirty(false);
      toast.success(
        event
          ? "Event details saved."
          : "Draft created. Add a schedule when ready.",
      );
      setTimeout(() => {
        onClose?.();
        router.push(`/dashboard/events/${result?.data?.data?.id}`);
        router.refresh();
      }, 0);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      aria-busy={busy || uploading}
      onSubmit={save}
      onChange={() => setDirty(true)}
      className="space-y-4"
    >
      <fieldset
        disabled={busy || uploading}
        className="space-y-4 disabled:opacity-60"
      >
        <Field label="Title">
          <input
            className={inputClass}
            name="title"
            defaultValue={event?.title}
            required
            minLength={EVENT_FIELD_LIMITS.titleMin}
            maxLength={EVENT_FIELD_LIMITS.titleMax}
          />
        </Field>
        <Field label="Description">
          <textarea
            className={inputClass}
            name="description"
            defaultValue={event?.description}
            required
            minLength={EVENT_FIELD_LIMITS.descriptionMin}
            maxLength={EVENT_FIELD_LIMITS.descriptionMax}
            rows={4}
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default location">
            <input
              className={inputClass}
              name="location"
              defaultValue={event?.location}
              required
              maxLength={EVENT_FIELD_LIMITS.shortTextMax}
            />
          </Field>
          <Field label="Public URL slug">
            <input
              className={inputClass}
              name="navigation_slug"
              defaultValue={event?.navigation_slug}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </Field>
        </div>
        <PosterFields
          title={event?.title ?? "event"}
          url={event?.poster_url ?? null}
          alt={event?.poster_alt ?? ""}
          onBusy={setUploading}
          onChange={() => setDirty(true)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Call-to-action URL">
            <input
              className={inputClass}
              name="call_to_action_link"
              type="url"
              defaultValue={event?.call_to_action_link ?? ""}
            />
          </Field>
          <Field label="Call-to-action caption">
            <input
              className={inputClass}
              name="call_to_action_caption"
              maxLength={EVENT_FIELD_LIMITS.ctaCaptionMax}
              defaultValue={event?.call_to_action_caption ?? ""}
            />
          </Field>
        </div>
        <Field label="Gallery URL">
          <input
            className={inputClass}
            name="gallery_url"
            type="url"
            defaultValue={event?.gallery_url ?? ""}
          />
        </Field>
        <button className={buttonClass} type="submit">
          {submitLabel(
            busy,
            Boolean(event),
            "Create draft event",
            "Save details",
          )}
        </button>
      </fieldset>
      {onClose && (
        <button
          type="button"
          disabled={busy || uploading}
          className="text-sm underline"
          onClick={() => {
            if (discard()) onClose();
          }}
        >
          Cancel editing
        </button>
      )}
      {busy && <p role="status">Saving event…</p>}
      {uploading && <p role="status">Uploading poster…</p>}
      {error && (
        <p role="alert" className="whitespace-pre-wrap text-sm text-coral">
          {error}
        </p>
      )}
    </form>
  );
}
