"use client";
import { EVENT_FIELD_LIMITS } from "@/features/events/constants";

import { useState } from "react";
import { uploadEventPoster } from "@/actions/events";
import { type BaseEvent } from "../domain";
import { assertResponse, inputClass } from "../lib/formUtilities";
import { Field } from "./Field";
import { PosterPreview } from "./PosterPreview";

export function PosterFields({
  title,
  url,
  alt,
  inherited,
  onBusy,
  onChange,
}: Readonly<{
  title: string;
  url: string | null;
  alt: string;
  inherited?: BaseEvent;
  onBusy: (busy: boolean) => void;
  onChange: () => void;
}>) {
  const [posterUrl, setUrl] = useState(url ?? "");
  const [posterAlt, setAlt] = useState(alt ?? "");
  const [override, setOverride] = useState(Boolean(url));
  const effectiveUrl =
    inherited && !override ? inherited.poster_url : posterUrl;
  const [error, setError] = useState("");
  const upload = async (file?: File) => {
    if (!file) return;
    onBusy(true);
    setError("");
    try {
      const result = await uploadEventPoster({ file, title: title || "event" });
      assertResponse(result);
      setUrl(result?.data?.data ?? "");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      onBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      {inherited && (
        <Field label="Poster source">
          <select
            className={inputClass}
            value={override ? "override" : "inherit"}
            onChange={(e) => {
              setOverride(e.target.value === "override");
              onChange();
            }}
          >
            <option value="inherit">Use event poster</option>
            <option value="override">Use a different poster</option>
          </select>
        </Field>
      )}
      {(!inherited || override) && (
        <>
          <Field label="Poster URL">
            <input
              className={inputClass}
              type="url"
              value={posterUrl}
              onChange={(e) => {
                setUrl(e.target.value);
                onChange();
              }}
            />
          </Field>
          <Field label="Or upload a JPG / PNG (up to 5 MB)">
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </Field>
          <Field label="Poster description">
            <input
              className={inputClass}
              value={posterAlt}
              required={Boolean(posterUrl)}
              maxLength={EVENT_FIELD_LIMITS.shortTextMax}
              onChange={(e) => setAlt(e.target.value)}
            />
          </Field>
          {posterUrl && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setUrl("");
                setAlt("");
                onChange();
              }}
            >
              Remove poster
            </button>
          )}
        </>
      )}
      <input
        type="hidden"
        name="poster_url"
        value={inherited && !override ? "" : posterUrl}
      />
      <input
        type="hidden"
        name="poster_alt"
        value={inherited && !override ? "" : posterAlt}
      />
      <PosterPreview
        key={effectiveUrl}
        url={effectiveUrl}
        alt={inherited && !override ? inherited.poster_alt : posterAlt}
      />
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
    </div>
  );
}
