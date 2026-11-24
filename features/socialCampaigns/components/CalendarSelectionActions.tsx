"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import type { SocialCalendarPost } from "@/app/schemas/socialCampaigns";
import { approveSocialPosts, bulkSocialPostAction, getSocialCalendarPosts } from "@/actions/socialCampaigns";
import { canApprovePost, canDraftPost, canDeletePost } from "../lib/postApproval";

export default function CalendarSelectionActions({ posts, canEdit, canPublish, canDelete, onOpen, onClear, onRefreshed, onBusyChange }: Readonly<{
  posts: SocialCalendarPost[];
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
  onOpen: (post: SocialCalendarPost) => void;
  onClear: () => void;
  onRefreshed: (posts: SocialCalendarPost[]) => void;
  onBusyChange: (busy: boolean) => void;
}>) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (action: "approve" | "draft" | "delete") => {
    if (action === "delete" && !confirm(`Delete ${posts.length} selected ${posts.length === 1 ? "post" : "posts"}? Generated posts will be cancelled so they cannot be recreated.`)) return;
    setWorking(true);
    onBusyChange(true);
    setError(null);
    let saved = false;
    try {
      const selected = posts.map(({ id, version }) => ({ id, version }));
      const result = action === "approve"
        ? await approveSocialPosts({ posts: selected })
        : await bulkSocialPostAction({ posts: selected, action });
      if (!result?.data || result.data.error)
        throw new Error(result?.data?.error || result?.serverError || "Could not update selected posts.");
      saved = true;
      const refreshed = await getSocialCalendarPosts({});
      if (!refreshed?.data?.data || refreshed.data.error)
        throw new Error("Changes were saved, but refreshing failed. Reload this page before making more changes.");
      onRefreshed(refreshed.data.data);
      onClear();
      toast.success(action === "approve" ? "Selected posts approved." : action === "draft" ? "Selected posts converted to drafts." : "Selected posts deleted.");
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Could not update selected posts.";
      setError(saved ? message : `${message} No posts were changed.`);
    } finally { setWorking(false); onBusyChange(false); }
  };
  const disabled = working || posts.length > 100;
  const buttonClass = "rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold disabled:opacity-40";

  return (
    <div className="mb-3 rounded-xl bg-teal-soft p-3" aria-busy={working}>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Selected post actions">
        <span className="mr-auto text-sm font-semibold" role="status">{posts.length} selected</span>
        {posts.length === 1 && <button type="button" className={buttonClass} disabled={working} onClick={() => onOpen(posts[0])}>Open selection</button>}
        {canEdit && <button type="button" className={buttonClass} disabled={disabled || !posts.every(canDraftPost)} onClick={() => perform("draft")}>Convert to draft</button>}
        {canEdit && canPublish && <button type="button" className={buttonClass} disabled={disabled || !posts.every(canApprovePost)} onClick={() => perform("approve")}>Approve selected</button>}
        {canDelete && <button type="button" className={buttonClass} disabled={disabled || !posts.every(canDeletePost)} onClick={() => perform("delete")}>Delete selected</button>}
        <button type="button" className={buttonClass} disabled={working} onClick={onClear}>Clear</button>
      </div>
      {posts.length > 100 && <p className="mt-2 text-xs">Select up to 100 posts per action.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-coral">{error}</p>}
    </div>
  );
}
