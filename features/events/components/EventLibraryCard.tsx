"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LibraryDisplayItem, LibrarySort } from "../library/filters";

export function EventLibraryCard({ event, sort = "next_occurrence" }: Readonly<{ event: LibraryDisplayItem; sort?: LibrarySort }>) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = event.poster_url;
  const valid = Boolean(url && URL.canParse(url) && new URL(url).protocol === "https:");
  return <li className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface">
    <div className="relative aspect-[3/4] bg-teal-soft">
      {valid && url !== failedUrl ? <Image src={url!} alt={event.poster_alt || `Poster for ${event.title}`} fill unoptimized sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, (max-width: 1535px) 25vw, 17vw" className="object-contain" onError={() => setFailedUrl(url)} /> :
        <div className="flex h-full items-center justify-center text-sm text-teal-dark">Poster unavailable</div>}
    </div>
    <div className="flex h-64 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-teal-soft px-2 py-1 capitalize text-teal-dark">{event.publication_status}</span>
        {event.schedule_kind && <span className="text-muted">{event.schedule_kind}</span>}
      </div>
      <h2 className="line-clamp-2 break-words text-lg font-semibold" title={event.title}>{event.title}</h2>
      <p className="text-sm text-muted">{event.next_display_date ? `Next: ${event.next_display_date} (Toronto)` : "No upcoming sessions"}</p>
      {sort !== "next_occurrence" && <p className="text-xs text-muted">{sort === "created_at" ? "Created" : "Updated"}: {event.display_date}</p>}
      <Link href={`/dashboard/events/${event.id}`} aria-label={`Manage ${event.title}`} className="mt-auto self-start rounded-lg text-sm font-semibold text-teal-dark underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Manage event <span aria-hidden="true">→</span></Link>
    </div>
  </li>;
}
