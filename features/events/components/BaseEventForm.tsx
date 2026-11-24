"use client";
import { EVENT_FIELD_LIMITS } from "@/features/events/constants";

import { useRequestId } from "../hooks/useRequestId";

import { useRef, useState, useTransition, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { saveBaseEvent } from "@/actions/events";
import { baseFields } from "../schemas";
import { type BaseEvent } from "../domain";
import { eventContentKey } from "../lib/formSnapshot";
import { useTrackedForm } from "../hooks/useTrackedForm";
import { useCan } from "@/store/hooks";
import {
  assertResponse,
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
  const formRef = useRef<HTMLFormElement>(null);
  const sourceContent = useRef(event ? eventContentKey(event) : null);
  const router = useRouter();
  const [ctaMode, setCtaMode] = useState<"form" | "link">(
    event?.call_to_action_link || event?.call_to_action_caption ? "link" : "form",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canEdit = useCan("events.edit");
  const [resetVersion, setResetVersion] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  function reset() {
    formRef.current?.reset();
    sourceContent.current = event ? eventContentKey(event) : null;
    setCtaMode(event?.call_to_action_link || event?.call_to_action_caption ? "link" : "form");
    setResetVersion((version) => version + 1);
    setError("");
  }
  const tracked = useTrackedForm("details", formRef, busy || refreshing, reset);
  const requestId = useRequestId();
  async function save(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (tracked.blocked || !canEdit) return;
    setError("");
    setBusy(true);
    try {
      if (event && sourceContent.current !== eventContentKey(event))
        throw new Error("Event details changed. Cancel to load the current values before saving.");
      const form = new FormData(e.currentTarget);
      const fields = baseFields.parse({
        title: value(form, "title"),
        description: value(form, "description"),
        location: value(form, "location"),
        navigation_slug: value(form, "navigation_slug"),
        poster_url: nullable(form, "poster_url"),
        poster_alt: value(form, "poster_alt"),
        cognito_form_id: ctaMode === "form" ? nullable(form, "cognito_form_id") : null,
        call_to_action_link: ctaMode === "link" ? nullable(form, "call_to_action_link") : null,
        call_to_action_caption: ctaMode === "link" ? nullable(form, "call_to_action_caption") : null,
        gallery_url: nullable(form, "gallery_url"),
      });
      const payload = { id: event?.id, version: event?.version, fields };
      const result = await saveBaseEvent({
        ...payload,
        request_id: requestId(payload),
      });
      assertResponse(result);
      if (event) sourceContent.current = eventContentKey({ ...event, ...fields });
      tracked.commit();
      toast.success(
        event
          ? "Event details saved."
          : "Draft created. Add a schedule when ready.",
      );
      startRefresh(() => {
        if (!event) router.push(`/dashboard/events/${result?.data?.data?.id}`);
        router.refresh();
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      aria-busy={busy || refreshing}
      onSubmit={save}
      onChange={tracked.changed}
      className="space-y-5"
    >
      <fieldset
        disabled={tracked.blocked || !canEdit}
        className="space-y-5 disabled:opacity-60"
      >
        <Field label="Event name">
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
          key={resetVersion}
          url={event?.poster_url ?? null}
          alt={event?.poster_alt ?? ""}
          onChange={tracked.changed}
        />
        <Field label="Event action">
          <select name="cta_mode" className={inputClass} value={ctaMode} onChange={(e) => setCtaMode(e.target.value as "form" | "link")}>
            <option value="form">Cognito form</option>
            <option value="link">CTA link and caption</option>
          </select>
        </Field>
        <fieldset hidden={ctaMode !== "form"} disabled={ctaMode !== "form"}>
          <Field label="Cognito form ID">
            <input className={inputClass} name="cognito_form_id" type="text" inputMode="numeric" pattern="[0-9]+" defaultValue={event?.cognito_form_id ?? ""} placeholder="123" />
          </Field>
        </fieldset>
        <fieldset hidden={ctaMode !== "link"} disabled={ctaMode !== "link"} className={ctaMode === "link" ? "grid gap-4 md:grid-cols-2" : "hidden"}>
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
        </fieldset>
        <Field label="Gallery URL">
          <input
            className={inputClass}
            name="gallery_url"
            type="url"
            defaultValue={event?.gallery_url ?? ""}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          {(onClose || event) && <button
            type="button" disabled={tracked.blocked || !canEdit}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-canvas disabled:opacity-50"
            onClick={() => tracked.cancel(() => { reset(); onClose?.(); })}
          >Cancel</button>}
          <button className="rounded-full bg-teal px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-50" type="submit" disabled={Boolean(event) && !tracked.dirty}>
            {submitLabel(busy, Boolean(event), "Create draft event", "Save changes")}
          </button>
        </div>
      </fieldset>
      {(busy || refreshing) && <p role="status">Saving event…</p>}
      {!canEdit && <p className="text-sm text-muted">You have read-only access to event details.</p>}
      {error && (
        <p role="alert" className="whitespace-pre-wrap text-sm text-coral">
          {error}
        </p>
      )}
    </form>
  );
}
