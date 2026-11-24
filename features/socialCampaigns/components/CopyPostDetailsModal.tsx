"use client";

import { postStatusLabel } from "../lib/postApproval";
import { useEffect, useState } from "react";
import type { z } from "zod";
import type { SocialCalendarPost, PlatformDefaults } from "@/app/schemas/socialCampaigns";
import { copySocialPostDetails, getSocialCalendarPosts } from "@/actions/socialCampaigns";
import { COPY_FIELDS, selectCopyDetails, type CopyField, type CopyDetailsZod } from "../lib/copyPostDetails";
import { CHANNEL_LABEL, SLOT_LABEL } from "./SocialPostsCalendar";

export default function CopyPostDetailsModal({ source, details, platform, canPublish, onClose, onCopied }: Readonly<{
  source: Pick<SocialCalendarPost, "campaign_id" | "post_title" | "channel"> & {id?: string};
  platform?: keyof PlatformDefaults;
  details: z.infer<typeof CopyDetailsZod>;
  canPublish: boolean;
  onClose: () => void;
  onCopied: (posts: SocialCalendarPost[]) => void;
}>) {
  const [fields, setFields] = useState<CopyField[]>([]);
  const [step, setStep] = useState<"fields" | "posts">("fields");
  const [posts, setPosts] = useState<SocialCalendarPost[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<"all" | "draft" | "proposed" | "scheduled" | "failed">("all");
  useEffect(() => {
    let cancelled = false;
    getSocialCalendarPosts({ campaignId: source.campaign_id, copySourceId: source.id, copyTargets: true, platform: platform ?? "all", status, pageSize: 100, page }).then((result) => {
      if (cancelled) return;
      if (!result?.data || result.data.error) setError(result?.data?.error || result?.serverError || "Could not load posts.");
      else { setPosts(result.data.data ?? []); setHasMore("hasMore" in result.data && Boolean(result.data.hasMore)); }
      setLoading(false);
    }).catch(() => { if (!cancelled) { setError("Could not load posts."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [source.campaign_id, source.id, canPublish, page, status, platform, reload]);
  const apply = async () => {
    setWorking(true);
    setError("");
    try {
      const result = await copySocialPostDetails({
        source_id: source.id, platform, campaign_id: source.campaign_id, fields,
        details: selectCopyDetails(details, fields),
        targets: posts.filter(post => selected.includes(post.id)).map(({id,version}) => ({id,version})),
      });
      if (!result?.data || result.data.error) {
        setError(result?.data?.error || result?.serverError || "Could not copy details. Reload targets if posts changed.");
        return;
      }
      onCopied(result.data.data ?? []);
    } catch {
      setError("Unable to complete the request. Refresh the campaign before retrying if the connection was interrupted.");
    } finally { setWorking(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="copy-details-title" className="max-h-[85dvh] w-full max-w-2xl overflow-auto rounded-2xl bg-surface p-6 shadow-xl">
        <h2 id="copy-details-title" className="text-xl font-semibold text-ink">Copy post details</h2>
        <p className="mt-2 text-sm text-muted">Copy the current editor values from “{source.post_title}”. Only selected fields will replace values on the selected posts. Dates, times, platforms, and titles stay unchanged. Selected posts return to draft and require explicit approval.</p>
        <fieldset disabled={working} className="mt-4">
          <legend className="font-semibold">Filter target status</legend>
          <label className="flex flex-col gap-1 text-sm">Status
            <select value={status} onChange={event => {setStatus(event.target.value as typeof status); setPosts([]); setSelected([]); setPage(1); setLoading(true); setError("");}} className="rounded-lg border border-line p-2">
              <option value="all">All eligible statuses</option>
              {(["draft","proposed","scheduled","failed"] as const).map(value => <option key={value} value={value}>{postStatusLabel(value)}</option>)}
            </select>
          </label>
          <p className="mt-1 text-xs text-muted">Filtering does not select posts. Failed posts awaiting retry or provider reconciliation are excluded.</p>
        </fieldset>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error} <button type="button" disabled={working} onClick={() => { setPosts([]); setSelected([]); setLoading(true); setError(""); setReload(value => value + 1); }} className="underline">Reload targets</button></p>}
        <fieldset disabled={working} className="mt-4 space-y-3">
          <legend className="mb-2 font-semibold text-ink">{step === "fields" ? "Choose fields to copy" : "Choose posts in this campaign"}</legend>
          {step === "fields" ? (Object.entries(COPY_FIELDS) as [CopyField, string][]).filter(([field]) => !platform || field !== "hashtags").filter(([field]) => !(["instagram_story", "whatsapp"].includes(source.channel) && field === "hashtags") && !(source.channel === "instagram_story" && field === "caption")).map(([field, label]) => (
            <label key={field} className="flex items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={fields.includes(field)} onChange={(event) => setFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} />
              {platform ? field === "media_items" ? "Poster" : "Message" : field === "media_items" && source.channel !== "instagram_feed" ? "Media" : field === "caption" && source.channel === "whatsapp" ? "Message" : label}
            </label>
          )) : <>
            <p role="status" className="text-xs text-muted">{selected.length} selected posts will return to draft. Copying: {fields.map((field) => COPY_FIELDS[field]).join(", ")}. Posts will be saved as drafts without approval. Media must fit every selected format. Changing pages clears the selection.</p>
            {loading ? <p role="status">Loading posts…</p> : posts.length === 0 ? <p className="text-sm text-muted">No other eligible posts. Drafts, proposals, future scheduled posts and failed posts without a pending retry can receive details. Publishing permission is required for scheduled posts.</p> : <>
              <label className="flex items-center gap-3 border-b border-line pb-3 text-sm font-semibold">
                <input type="checkbox" checked={posts.length > 0 && selected.length === posts.length} onChange={(event) => setSelected(event.target.checked ? posts.map((post) => post.id) : [])} />
                Select all on this page ({posts.length})
              </label>
              {posts.map((post) => <label key={post.id} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={selected.includes(post.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, post.id] : current.filter((id) => id !== post.id))} />
                <span><span className="block font-semibold text-ink">{post.post_title}</span><span className="text-xs text-muted">{CHANNEL_LABEL[post.channel]} · {post.scheduled_date ?? "Unscheduled"}{post.time_slot ? ` · ${SLOT_LABEL[post.time_slot]}` : ""} · {postStatusLabel(post.status)}</span></span>
              </label>)}
            </>}
          </>}
        </fieldset>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={working} onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm">Cancel</button>
          {step === "posts" && <nav aria-label="Copy target pages" className="flex justify-between">
            <button disabled={page === 1 || loading || working} onClick={() => { setPosts([]); setSelected([]); setLoading(true); setPage(value => value - 1); }}>Previous</button>
            <button disabled={!hasMore || loading || working} onClick={() => { setPosts([]); setSelected([]); setLoading(true); setPage(value => value + 1); }}>Next</button>
          </nav>}
          {step === "fields" ? <button type="button" disabled={!fields.length} onClick={() => setStep("posts")} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Paste to these…</button> : <>
            <button type="button" disabled={working} onClick={() => setStep("fields")} className="rounded-xl border border-line px-4 py-2 text-sm">Back</button>
            <button type="button" disabled={working || loading || !selected.length} onClick={apply} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {working ? "Applying…" : `Apply ${fields.length} field${fields.length === 1 ? "" : "s"} to ${selected.length} post${selected.length === 1 ? "" : "s"}`}
            </button>
          </>}
        </div>
      </section>
    </div>
  );
}
