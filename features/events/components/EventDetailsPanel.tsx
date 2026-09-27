import { EVENT_DESCRIPTION_PREVIEW_LENGTH } from "../constants";
import { Badge } from "@/app/components/ui/Badge";
import { useCan } from "@/store/hooks";
import { DetailRow } from "./DetailRow";
import type { Event } from "@/app/schemas/events";
import { formatTorontoDateTime as formatDateTime } from "@/app/utils/date";

interface EventDetailsPanelProps {
  events: Event[];
  onEdit: (event: Event) => void;
  selectedDay?: string | null;
}

export function EventDetailsPanel({
  events,
  onEdit,
  selectedDay,
}: Readonly<EventDetailsPanelProps>) {
  const canEdit = useCan("events.view");
  if (!events.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-12 opacity-40">
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M8 2v3M16 2v3M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
        <p className="text-center text-body-sm">
          {selectedDay
            ? "No sessions to show on this day"
            : "Select a day to see its events"}
        </p>
      </div>
    );
  }

  const excerpt = (description: string) =>
    description.length > EVENT_DESCRIPTION_PREVIEW_LENGTH
      ? `${description.slice(0, EVENT_DESCRIPTION_PREVIEW_LENGTH).trimEnd()}…`
      : description;

  return (
    <div className="flex flex-col divide-y divide-line">
      {events.map((event) => (
        <article
          key={`${event.id}-${new Date(event.start_date).toISOString()}`}
          className="flex flex-col gap-3 p-5"
        >
          <div>
            <h3 className="text-subheading font-bold leading-snug">
              {event.title}
            </h3>
            {event.publication_status === "draft" && (
              <Badge variant="muted">Draft</Badge>
            )}
            {event.is_recurring && (
              <Badge variant="teal" className="mt-1">
                Recurring
              </Badge>
            )}
          </div>
          <div className="flex flex-col gap-2 text-body-sm">
            <DetailRow label="Start" value={formatDateTime(event.start_date)} />
            <DetailRow label="End" value={formatDateTime(event.end_date)} />
            {event.description && (
              <p className="leading-relaxed text-ink/80">
                {excerpt(event.description)}
              </p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-xl bg-teal-soft px-4 py-2 text-body-sm font-semibold text-teal-dark transition-colors hover:bg-teal/20"
              onClick={() => onEdit(event)}
            >
              View / Manage
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
