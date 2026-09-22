"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { archiveSocialCampaign, transitionSocialCampaign } from "@/actions/socialCampaigns";
import type { CampaignStatus } from "@/app/schemas/socialCampaigns";

export default function CampaignLifecycleControls({
  id,
  status,
  canSchedule,
  canDelete,
}: Readonly<{ id: string; status: CampaignStatus; canSchedule: boolean; canDelete: boolean }>) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const transition = status === "draft" ? "activate" : status === "active" ? "pause" : status === "paused" ? "resume" : null;

  const changeStatus = async () => {
    if (!transition) return;
    setWorking(true);
    const result = await transitionSocialCampaign({ id, action: transition });
    setWorking(false);
    if (result?.data?.error) return toast.error(result.data.error);
    toast.success("Campaign updated.");
    router.refresh();
  };

  const remove = async () => {
    if (!confirm("Remove this campaign? An empty draft is permanently deleted; otherwise it is archived and its history is preserved.")) return;
    setWorking(true);
    const result = await archiveSocialCampaign({ id });
    setWorking(false);
    if (result?.data?.error) return toast.error(result.data.error);
    toast.success(result?.data?.data?.deleted ? "Empty draft campaign deleted." : "Campaign archived.");
    router.push("/dashboard/posts");
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canSchedule && transition && (
        <button type="button" disabled={working} onClick={changeStatus} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {transition === "activate" ? "Activate" : transition === "pause" ? "Pause" : "Resume"}
        </button>
      )}
      {canDelete && status !== "archived" && (
        <button type="button" disabled={working} onClick={remove} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted disabled:opacity-50">Remove</button>
      )}
    </div>
  );
}
