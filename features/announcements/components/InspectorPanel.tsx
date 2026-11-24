"use client";

import AnnouncementStatusBadge from "./AnnouncementStatusBadge";
import type { Announcement } from "@/app/schemas/announcement";
import { isScheduled, isExpired, formatAnnouncementDate } from "../announcementUtils";
import { useAnnouncementModal } from "../modalContext";
import { useCan } from "@/store/hooks";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Link from "next/link";
import { transitionAnnouncementReview } from "../actions";

export default function InspectorPanel({
  selected,
  liveIds,
  canEdit,
}: Readonly<{
  selected: Announcement | null;
  liveIds: number[];
  canEdit: boolean;
}>) {
  const { openEdit, openRestore, openDelete } = useAnnouncementModal();
  const canDelete = useCan("announcements.delete");
  const canPublish = useCan("announcements.publish");
  const [working, setWorking] = useState(false);
  const router = useRouter();
  const scheduled = selected ? isScheduled(selected) : false;
  const expired = selected ? !scheduled && isExpired(selected) : false;

  if (!selected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted gap-2">
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-40"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p className="text-[12px] text-center opacity-40">
          Select an announcement
          <br />
          to inspect
        </p>
      </div>
    );
  }

  async function transition(action: "submit" | "approve" | "reject" | "withdraw" | "reopen") {
    if (!selected || working) return;
    if (["approve", "withdraw"].includes(action) && !confirm(action === "approve" ? "Approve this exact announcement for publication?" : "Withdraw this announcement from the public site?")) return;
    setWorking(true);
    try {
      const result = await transitionAnnouncementReview({ id: selected.id, revision: selected.revision, action });
      if (!result?.data?.success) throw new Error(result?.data?.error || result?.serverError || "Unable to update announcement.");
      toast.success("Announcement updated.");
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update announcement."); }
    finally { setWorking(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-ink">
          {expired ? "Expired announcement" : "Edit announcement"}
        </h3>
        <AnnouncementStatusBadge announcement={selected} />
      </div>

      {selected.review_state === "approved" && !expired && !scheduled && (
        <p className="text-[11px] text-muted">
          Position {liveIds.indexOf(selected.id) + 1} of {liveIds.length} in
          rotation
        </p>
      )}

      {selected.publish_at && (
        <div>
          <p className="text-[11px] text-muted mb-0.5">Go-live time</p>
          <p className="text-[12px] text-ink">
            {formatAnnouncementDate(selected.publish_at)}
          </p>
        </div>
      )}
      <div>
        <p className="text-[11px] text-muted mb-0.5">Title</p>
        <p className="text-[13px] font-semibold text-ink">{selected.title}</p>
      </div>
      <div>
        <p className="text-[11px] text-muted mb-0.5">Description</p>
        <p className="text-[12px] text-ink/80 leading-relaxed">
          {selected.description}
        </p>
      </div>
      {selected.call_to_action_caption && (
        <div>
          <p className="text-[11px] text-muted mb-0.5">Call to action</p>
          <p className="text-[12px] font-medium text-ink">
            {selected.call_to_action_caption}
          </p>
        </div>
      )}
      <div>
        <p className="text-[11px] text-muted mb-0.5">
          {expired ? "Expired" : "Expires"}
        </p>
        <p className="text-[12px] text-ink">{formatAnnouncementDate(selected.expires_at)}</p>
      </div>

      <Link href={`/dashboard/announcements/${selected.id}/history`} className="text-sm font-semibold text-teal">View change history</Link>
      <div className="flex flex-col gap-2">
        {canEdit && selected.review_state === "draft" && <button type="button" disabled={working} onClick={() => transition("submit")} className="rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit for review</button>}
        {canPublish && selected.review_state === "pending" && <>
          <button type="button" disabled={working} onClick={() => transition("approve")} className="rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve publication</button>
          <button type="button" disabled={working} onClick={() => transition("reject")} className="rounded-xl border border-line px-3 py-2 text-sm">Request changes</button>
        </>}
        {canPublish && selected.review_state === "approved" && <button type="button" disabled={working} onClick={() => transition("withdraw")} className="rounded-xl border border-line px-3 py-2 text-sm">Withdraw</button>}
        {canEdit && selected.review_state === "withdrawn" && <button type="button" disabled={working} onClick={() => transition("reopen")} className="rounded-xl border border-line px-3 py-2 text-sm">Return to draft</button>}
      </div>

      {(canEdit || canDelete) && (
        <div className="flex flex-col gap-2 pt-3 border-t border-line">
          {canEdit &&
            (expired ? (
              <button
                onClick={() => openRestore(selected)}
                className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-colors"
                style={{
                  backgroundColor: "#0F8073",
                  boxShadow: "0 4px 12px -4px rgba(15,128,115,.5)",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-3.99" />
                </svg>
                Change expiry
              </button>
            ) : (
              <button
                onClick={() => openEdit(selected)}
                className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors bg-teal-soft text-teal hover:bg-teal/20"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
            ))}
          {canDelete && (
            <button
              type="button"
              onClick={() => openDelete(selected)}
              className="inline-flex w-full items-center justify-center rounded-xl border border-coral/30 px-4 py-2.5 text-[13px] font-semibold text-coral transition-colors hover:bg-coral/5"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
