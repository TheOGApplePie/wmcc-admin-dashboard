"use client";

import { useNavigationGuard } from "@/features/navigation/UnsavedChangesProvider";
import { useRouter } from "next/navigation";
import { useCan } from "@/store/hooks";
import { changeEventStatus, removeBaseEvent } from "@/actions/events";
import type { BaseEvent } from "../domain";
import { buttonClass } from "../lib/formUtilities";
import type { Campaign } from "../lib/eventManagement";
import { useEventMutation } from "../hooks/useEventMutation";

export function EventActions({
  event,
  campaign,
  run,
  busy,
}: Readonly<{
  event: BaseEvent;
  campaign: Campaign | null;
  run: ReturnType<typeof useEventMutation>["run"];
  busy: boolean;
}>) {
  const router = useRouter();
  const guard = useNavigationGuard();
  const canPublish = useCan("events.publish");
  const canDelete = useCan("events.delete");
  const versioned = { event_id: event.id, version: event.version };
  function status(next: BaseEvent["publication_status"]) {
    if (
      next !== "published" &&
      !confirm(
        "This hides the event from public readers and returns its linked campaign to draft. Continue?",
      )
    )
      return;
    const perform = () => { void run(() =>
      changeEventStatus({
        ...versioned,
        status: next,
        request_id: crypto.randomUUID(),
      }),
    ); };
    if (guard) guard.request(perform); else perform();
  }
  function remove() {
    if (
      !confirm(
        "Permanently delete this event and all its schedules and sessions?",
      )
    )
      return;
    const perform = () => { void run(
      () => removeBaseEvent({ ...versioned, request_id: crypto.randomUUID() }),
      () => router.push("/dashboard/events"),
    ); };
    if (guard) guard.request(perform); else perform();
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {canPublish && event.publication_status !== "published" && (
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => status("published")}
        >
          Publish event
        </button>
      )}
      {canPublish && event.publication_status === "published" && (
        <button
          type="button"
          className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          disabled={busy}
          onClick={() => status("draft")}
        >
          Return to draft
        </button>
      )}
      {((canPublish && event.publication_status !== "archived") || (canDelete && !campaign)) && (
        <details className="relative">
          <summary aria-label="More event actions" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl text-xl font-bold text-muted hover:bg-canvas [&::-webkit-details-marker]:hidden">⋯</summary>
          <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
            {canPublish && event.publication_status !== "archived" && <button type="button" disabled={busy} onClick={() => status("archived")}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-50">Archive</button>}
            {canDelete && !campaign && <button type="button" disabled={busy} onClick={remove}
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-50">Delete event</button>}
          </div>
        </details>
      )}

    </div>
  );
}
