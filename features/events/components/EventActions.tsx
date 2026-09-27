"use client";

import Link from "next/link";
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
  onDetails,
  details,
}: Readonly<{
  event: BaseEvent;
  campaign: Campaign | null;
  run: ReturnType<typeof useEventMutation>["run"];
  busy: boolean;
  onDetails: () => void;
  details: boolean;
}>) {
  const router = useRouter();
  const canEdit = useCan("events.edit");
  const canPublish = useCan("events.publish");
  const canDelete = useCan("events.delete");
  const canSocial = useCan("social.view");
  const versioned = { event_id: event.id, version: event.version };
  function status(next: BaseEvent["publication_status"]) {
    if (
      next !== "published" &&
      !confirm(
        "This hides the event from public readers and returns its linked campaign to draft. Continue?",
      )
    )
      return;
    void run(() =>
      changeEventStatus({
        ...versioned,
        status: next,
        request_id: crypto.randomUUID(),
      }),
    );
  }
  function remove() {
    if (
      !confirm(
        "Permanently delete this event and all its schedules and sessions?",
      )
    )
      return;
    void run(
      () => removeBaseEvent({ ...versioned, request_id: crypto.randomUUID() }),
      () => router.push("/dashboard/events"),
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {canEdit && (
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={onDetails}
        >
          {details ? "Hide details" : "Edit event details"}
        </button>
      )}
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
          className={buttonClass}
          disabled={busy}
          onClick={() => status("draft")}
        >
          Return to draft
        </button>
      )}
      {canPublish && event.publication_status !== "archived" && (
        <button
          type="button"
          className="text-sm underline"
          disabled={busy}
          onClick={() => status("archived")}
        >
          Archive
        </button>
      )}
      {canDelete && !campaign && (
        <button
          type="button"
          className="text-sm text-coral underline"
          disabled={busy}
          onClick={remove}
        >
          Delete event
        </button>
      )}
      {canSocial && (
        <Link
          className="text-sm underline"
          href={
            campaign ? `/dashboard/posts/${campaign.id}` : "/dashboard/posts"
          }
        >
          {campaign
            ? `Manage campaign: ${campaign.name}`
            : "Link a campaign in Social Posts"}
        </Link>
      )}
    </div>
  );
}
