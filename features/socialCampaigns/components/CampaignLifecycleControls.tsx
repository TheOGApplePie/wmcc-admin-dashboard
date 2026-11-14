"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  archiveSocialCampaign,
  transitionSocialCampaign,
} from "@/actions/socialCampaigns";
import type { CampaignStatus } from "@/app/schemas/socialCampaigns";

export default function CampaignLifecycleControls({
  id,
  status,
  canPublish,
  canDelete,
  eventPublished = true,
}: Readonly<{
  id: string;
  status: CampaignStatus;
  canPublish: boolean;
  canDelete: boolean;
  eventPublished?: boolean;
}>) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const transition =
    status === "draft"
      ? "activate"
      : status === "active"
        ? "pause"
        : status === "paused"
          ? "resume"
          : null;

  const changeStatus = async (
    action: "activate" | "pause" | "resume" | "complete",
  ) => {
    setWorking(true);
    try {
      const result = await transitionSocialCampaign({ id, action });
      if (!result?.data || result.data.error) {
        toast.error(
          result?.data?.error ||
            result?.serverError ||
            "Could not update campaign.",
        );
        return;
      }
      toast.success(
        action === "complete"
          ? "Campaign marked as completed."
          : "Campaign updated.",
      );
      router.refresh();
    } catch {
      toast.error("Could not update campaign.");
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        "Remove this campaign? An empty draft is permanently deleted; otherwise it is archived, pending posts are cancelled, and its history is preserved.",
      )
    )
      return;
    setWorking(true);
    const result = await archiveSocialCampaign({ id });
    setWorking(false);
    if (result?.data?.error) return toast.error(result.data.error);
    toast.success(
      result?.data?.data?.deleted
        ? "Empty draft campaign deleted."
        : "Campaign archived.",
    );
    router.push("/dashboard/posts");
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {!eventPublished && (
        <p className="w-full text-sm text-muted">
          Publish the linked event before activating this campaign. Event
          publication does not activate it automatically.
        </p>
      )}
      {canPublish && transition && (
        <button
          type="button"
          disabled={working || (!eventPublished && transition !== "pause")}
          onClick={() => changeStatus(transition)}
          className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {transition === "activate"
            ? "Activate"
            : transition === "pause"
              ? "Pause"
              : "Resume"}
        </button>
      )}
      {canPublish && (status === "active" || status === "paused") && (
        <button
          type="button"
          disabled={working}
          onClick={() => changeStatus("complete")}
          className="rounded-xl border border-teal bg-surface px-4 py-2 text-sm font-semibold text-teal-dark disabled:opacity-50"
        >
          Mark completed
        </button>
      )}
      {status === "completed" && (
        <span
          role="status"
          className="self-center rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal-dark"
        >
          Completed
        </span>
      )}
      {canDelete && status !== "archived" && (
        <button
          type="button"
          disabled={working}
          onClick={remove}
          className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted disabled:opacity-50"
        >
          Remove
        </button>
      )}
    </div>
  );
}
