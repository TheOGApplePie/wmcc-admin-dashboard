import Link from "next/link";
import Image from "next/image";
import type { Event } from "@/app/schemas/events";
import { fmtTime } from "./_lib/dashboard";
import styles from "./DashboardEvents.module.css";

export function EventHeroCard({
  event,
  occurrenceDate,
}: Readonly<{ event: Event; occurrenceDate: Date }>) {
  const dayName = occurrenceDate.toLocaleDateString("en-CA", {
    weekday: "long",
    timeZone: "UTC",
  });
  const timeStr = fmtTime(event.start_date);

  return (
    <article
      aria-label={event.title}
      className={`${styles.hero} relative overflow-hidden rounded-t-2xl`}
    >
      {/* Background: poster image or teal gradient fallback */}
      {event.poster_url ? (
        <Image
          src={event.poster_url}
          alt={event.title}
          fill
          className="object-cover"
        />
      ) : (
        <div
          className={`${styles.fallback} absolute inset-0`}
        />
      )}

      {/* Gradient overlay for text legibility */}
      <div
        className={`${styles.overlay} absolute inset-0`}
      />

      {/* Card content */}
      <div
        className={`${styles.content} relative flex flex-col justify-between p-5`}
      >
        {/* "Up next" pill */}
        <div>
          <span
            className={`${styles.glass} inline-flex items-center gap-1.5 text-caption font-semibold px-3 py-1 rounded-full`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber"
            />
            Up next · {dayName}
          </span>
        </div>

        {/* Title + meta */}
        <div className="flex flex-col gap-2 mt-3">
          <h3 className="text-white text-xl font-bold leading-snug">
            {event.title}
          </h3>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1 text-white/80 text-xs">
              <svg aria-hidden="true"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {timeStr}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 text-white/80 text-xs">
                <svg aria-hidden="true"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {event.location}
              </span>
            )}
          </div>

          {/* Manage event */}
          <div className="flex items-center justify-end mt-1">
            <Link
              href="/dashboard/events"
              className={`${styles.glass} text-xs font-semibold px-4 py-1.5 rounded-xl transition-colors hover:bg-white/20`}
            >
              Manage event
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
