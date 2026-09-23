import { type Event } from "@/app/schemas/events";
import { Badge } from "@/app/components/ui/Badge";
import { useCan } from "@/store/hooks";

const DISPLAY_TIME_ZONE = "America/Toronto";

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  });
}

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] text-muted">{label}</p>
      <p>{value}</p>
    </div>
  );
}

interface EventDetailsPanelProps {
  events: Event[];
  onEdit: (event: Event) => void;
}

export function EventDetailsPanel({
  events,
  onEdit,
}: Readonly<EventDetailsPanelProps>) {
  const canEdit = useCan("events.edit");
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
        <p className="text-center text-[13px]">Select a day to see its events</p>
      </div>
    );
  }

  const excerpt = (description: string) =>
    description.length > 50 ? `${description.slice(0, 50).trimEnd()}…` : description;

  return (
    <div className="flex flex-col divide-y divide-line">
      {events.map((event) => (
        <article key={`${event.id}-${new Date(event.start_date).toISOString()}`} className="flex flex-col gap-3 p-5">
          <div>
            <h3 className="text-[15px] font-bold leading-snug">{event.title}</h3>
            {event.is_recurring && <Badge variant="teal" className="mt-1">Recurring</Badge>}
          </div>
          <div className="flex flex-col gap-2 text-[13px]">
            <DetailRow label="Start" value={formatDateTime(event.start_date)} />
            <DetailRow label="End" value={formatDateTime(event.end_date)} />
            {event.description && <p className="leading-relaxed text-ink/80">{excerpt(event.description)}</p>}
          </div>
          {canEdit && <button type="button" className="inline-flex w-full items-center justify-center rounded-xl bg-teal-soft px-4 py-2 text-[13px] font-semibold text-teal-dark transition-colors hover:bg-teal/20" onClick={() => onEdit(event)}>
            Edit / Manage
          </button>}
        </article>
      ))}
    </div>
  );
}
