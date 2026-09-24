"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

function ImageWithFeedback(props: Readonly<ImageProps>) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  if (state === "failed")
    return (
      <span
        role="status"
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas p-2 text-center text-xs text-muted"
      >
        <span>Poster unavailable</span>
        <span>{props.alt}</span>
      </span>
    );
  return (
    <>
      {state === "loading" && (
        <span
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-canvas text-xs text-muted"
        >
          Loading poster
        </span>
      )}
      <Image
        {...props}
        alt={props.alt}
        onLoad={() => setState("loaded")}
        onError={() => setState("failed")}
      />
    </>
  );
}

export default function AnnouncementImage(props: Readonly<ImageProps>) {
  return <ImageWithFeedback key={String(props.src)} {...props} />;
}
