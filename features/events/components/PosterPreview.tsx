"use client";

import { useState } from "react";

export function PosterPreview({
  url,
  alt,
}: Readonly<{ url: string | null; alt: string }>) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  if (!url) return <p className="text-sm text-muted">No poster selected.</p>;
  if (state === "error")
    return (
      <p role="alert" className="text-sm text-coral">
        Poster could not be loaded. Check its URL.
      </p>
    );
  return (
    <div aria-busy={state === "loading"}>
      {state === "loading" && (
        <p role="status" className="text-sm">
          Loading poster…
        </p>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="max-h-48 rounded-xl object-contain"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}
