interface EmptyCalendarStateProps {
  onAdd: () => void;
}
import { useCan } from "@/store/hooks";

export function EmptyCalendarState({ onAdd }: Readonly<EmptyCalendarStateProps>) {
  const canEdit = useCan("events.edit");
  return (
    <div className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-ink">No events in this period</p>
        <p className="text-xs text-muted">Schedule an event or navigate to another month.</p>
      </div>
      {canEdit && <button
        type="button"
        onClick={onAdd}
        className="shrink-0 rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white hover:bg-teal-dark"
      >
        Add Event
      </button>}
    </div>
  );
}
