import Link from "next/link";
import type { Event } from "@/app/schemas/events";
import { fmtTime, occurrenceTimeLabel } from "./_lib/dashboard";

export function AlsoThisWeekRow({
  event,
  occurrenceDate,
  dotClassName,
}: Readonly<{ event: Event; occurrenceDate: Date; dotClassName: string }>) {
  const timeLabel = occurrenceTimeLabel(event, occurrenceDate);
  const timeStr = fmtTime(event.start_date);

  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      className="flex items-center gap-3 px-5 py-3 hover:bg-canvas transition-colors group"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${dotClassName}`}
      />
      <span className="flex-1 text-body-sm font-medium text-ink truncate group-hover:text-teal-dark transition-colors">
        {event.title}
      </span>
      <span className="text-caption text-muted shrink-0 hidden sm:inline">
        {timeLabel} · {timeStr}
      </span>
      <svg aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-muted shrink-0"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
