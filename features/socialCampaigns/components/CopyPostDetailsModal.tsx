"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import type { SocialCalendarPost } from "@/app/schemas/socialCampaigns";
import { copySocialPostDetails, getSocialCalendarPosts } from "@/actions/socialCampaigns";
import { COPY_FIELDS, selectCopyDetails, type CopyField, type CopyDetailsZod } from "../lib/copyPostDetails";
import { CHANNEL_LABEL, SLOT_LABEL } from "./SocialPostsCalendar";

export default function CopyPostDetailsModal({ source, details, canPublish, onClose, onCopied }: Readonly<{
  source: SocialCalendarPost;
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
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getSocialCalendarPosts().then((result) => {
      if (cancelled) return;
      if (!result?.data || result.data.error) setError(result?.data?.error || result?.serverError || "Could not load posts.");
      else setPosts((result.data.data ?? []).filter((post) =>
        post.campaign_id === source.campaign_id && post.id !== source.id &&
        ["draft", "proposed", "scheduled"].includes(post.status) &&
        !["archived", "completed"].includes(post.campaign_status) &&
        (post.status !== "scheduled" || (canPublish && Boolean(post.scheduled_at && Date.parse(post.scheduled_at) > Date.now()))),
      ).sort((a, b) => (a.scheduled_date ?? "9999").localeCompare(b.scheduled_date ?? "9999")));
      setLoading(false);
    }).catch(() => { if (!cancelled) { setError("Could not load posts."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [source.campaign_id, source.id, canPublish]);
  const apply = async () => {
    setWorking(true);
    setError("");
    try {
      if (!applied) {
        const result = await copySocialPostDetails({
          source_id: source.id, campaign_id: source.campaign_id, fields,
          details: selectCopyDetails(details, fields),
          targets: posts.filter((post) => selected.includes(post.id)).map(({ id, version }) => ({ id, version })),
        });
        if (!result?.data || result.data.error) {
          setError(result?.data?.error || result?.serverError || "Could not copy details.");
          return;
        }
        setApplied(true);
      }
      const refreshed = await getSocialCalendarPosts();
      if (!refreshed?.data || refreshed.data.error) {
        setError("Details were applied, but refreshing failed. Retry refresh to see the updated posts.");
        return;
      }
      onCopied(refreshed.data.data ?? []);
    } catch {
      setError("Unable to complete the request. Refresh the campaign before retrying if the connection was interrupted.");
    } finally { setWorking(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="copy-details-title" className="max-h-[85dvh] w-full max-w-2xl overflow-auto rounded-2xl bg-surface p-6 shadow-xl">
        <h2 id="copy-details-title" className="text-xl font-semibold text-ink">Copy post details</h2>
        <p className="mt-2 text-sm text-muted">Copy the current editor values from “{source.post_title}”. Only selected fields will replace values on the selected posts. Dates, times, platforms, titles, and statuses stay unchanged.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <fieldset disabled={working || applied} className="mt-4 space-y-3">
          <legend className="mb-2 font-semibold text-ink">{step === "fields" ? "Choose fields to copy" : "Choose posts in this campaign"}</legend>
          {step === "fields" ? (Object.entries(COPY_FIELDS) as [CopyField, string][]).map(([field, label]) => (
            <label key={field} className="flex items-center gap-3 text-sm text-ink">
              <input type="checkbox" checked={fields.includes(field)} onChange={(event) => setFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} />
              {label}
            </label>
          )) : <>
            <p className="text-xs text-muted">Copying: {fields.map((field) => COPY_FIELDS[field]).join(", ")}. Scheduled posts remain scheduled. Media must fit every selected format.</p>
            {loading ? <p role="status">Loading posts…</p> : posts.length === 0 ? <p className="text-sm text-muted">No other eligible posts. Drafts, proposals, and future scheduled posts can receive details. Publishing permission is required for scheduled posts.</p> : <>
              <label className="flex items-center gap-3 border-b border-line pb-3 text-sm font-semibold">
                <input type="checkbox" checked={selected.length === posts.length} onChange={(event) => setSelected(event.target.checked ? posts.map((post) => post.id) : [])} />
                Select all ({posts.length})
              </label>
              {posts.map((post) => <label key={post.id} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={selected.includes(post.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, post.id] : current.filter((id) => id !== post.id))} />
                <span><span className="block font-semibold text-ink">{post.post_title}</span><span className="text-xs text-muted">{CHANNEL_LABEL[post.channel]} · {post.scheduled_date ?? "Unscheduled"}{post.time_slot ? ` · ${SLOT_LABEL[post.time_slot]}` : ""} · {post.status}</span></span>
              </label>)}
            </>}
          </>}
        </fieldset>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={working} onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm">Cancel</button>
          {step === "fields" ? <button type="button" disabled={!fields.length} onClick={() => setStep("posts")} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Paste to these…</button> : <>
            {!applied && <button type="button" disabled={working} onClick={() => setStep("fields")} className="rounded-xl border border-line px-4 py-2 text-sm">Back</button>}
            <button type="button" disabled={working || loading || (!applied && !selected.length)} onClick={apply} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {working ? "Applying…" : applied ? "Retry refresh" : `Apply ${fields.length} field${fields.length === 1 ? "" : "s"} to ${selected.length} post${selected.length === 1 ? "" : "s"}`}
            </button>
          </>}
        </div>
      </section>
    </div>
  );
}
