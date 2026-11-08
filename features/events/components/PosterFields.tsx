"use client";
import { EVENT_FIELD_LIMITS } from "@/features/events/constants";

import { useState } from "react";
import { type BaseEvent } from "../domain";
import { inputClass } from "../lib/formUtilities";
import { Field } from "./Field";
import { PosterPreview } from "./PosterPreview";
import StorageMediaPicker from "@/app/components/ui/StorageMediaPicker";

export function PosterFields({
  url,
  alt,
  inherited,
  onChange,
}: Readonly<{
  url: string | null;
  alt: string;
  inherited?: BaseEvent;
  onChange: () => void;
}>) {
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [posterUrl, setUrl] = useState(url ?? "");
  const [posterAlt, setAlt] = useState(alt ?? "");
  const [override, setOverride] = useState(Boolean(url));
  const effectiveUrl =
    inherited && !override ? inherited.poster_url : posterUrl;
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
          <button
            type="button"
            className="rounded-lg border border-teal px-3 py-2 text-sm font-semibold text-teal"
            onClick={() => setMediaPickerOpen(true)}
          >
            {posterUrl ? "Replace poster from storage" : "Choose poster from storage"}
          </button>
          <Field label="Poster description">
            <input
              className={inputClass}
              value={posterAlt}
              required={Boolean(posterUrl)}
              maxLength={EVENT_FIELD_LIMITS.shortTextMax}
              onChange={(e) => { setAlt(e.target.value); onChange(); }}
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
      {mediaPickerOpen && (
        <StorageMediaPicker
          context="events"
          mediaKind="image"
          maximum={1}
          selectedUrls={posterUrl ? [posterUrl] : []}
          onChange={(urls) => {
            setUrl(urls[0] ?? "");
            onChange();
          }}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}

    </div>
  );
}
