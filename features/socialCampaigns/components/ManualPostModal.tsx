"use client";

import { useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { createManualSocialPost, deleteSocialPost, getSocialCalendarPosts, updateSocialPost } from "@/actions/socialCampaigns";
import type { SocialCalendarPost, SocialCampaign, SocialPostChannel } from "@/app/schemas/socialCampaigns";
import { localSlotLabel, scheduledAtFor } from "@/features/socialCampaigns/scheduling/slots";
import CopyPostDetailsModal from "./CopyPostDetailsModal";
import StorageMediaPicker from "@/app/components/ui/StorageMediaPicker";

type PostDraft = { channel: SocialPostChannel;
  hashtags: string; call_to_action_link: string;
  call_to_action_caption: string;
};
const EMPTY = (channel: SocialPostChannel): PostDraft => ({
  channel,
  hashtags: "", call_to_action_link: "", call_to_action_caption: "",
});
const isVideoUrl = (url: string) => /\.(?:mp4|mov|m4v|webm)(?:\?|$)/i.test(url);
const mediaKindFor = (channel: SocialPostChannel) => channel === "instagram_reel" || channel === "tiktok_reel" ? "video" : channel === "whatsapp" ? "image_or_video" : "instagram_image";

export default function ManualPostModal({
  campaigns = [],
  initialCampaignId,
  initialDate,
  delivery = null,
  canEdit = true,
  canPublish = false,
  canDelete = false,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
  onCopied,
}: Readonly<{
  campaigns?: SocialCampaign[]; initialCampaignId: string | null; initialDate: string | null;
  delivery?: SocialCalendarPost | null;
  canEdit?: boolean; canPublish?: boolean;
  canDelete?: boolean;
  onClose: () => void; onCreated?: (deliveries: SocialCalendarPost[]) => void;
  onCopied?: (posts: SocialCalendarPost[]) => void;
  onUpdated?: (delivery: SocialCalendarPost) => void; onDeleted?: (id: string) => void;
}>) {
  const [campaignId, setCampaignId] = useState(delivery?.campaign_id ?? initialCampaignId ?? "");
  const [title, setTitle] = useState(delivery?.post_title ?? "");
  const [description, setDescription] = useState(delivery?.description ?? "");
  const [sharedCaption, setSharedCaption] = useState(delivery?.caption ?? "");
  const [mediaItems, setMediaItems] = useState<SocialCalendarPost["media_items"]>(delivery?.media_items?.length ? delivery.media_items
      : delivery?.media_url ? [{ url: delivery.media_url, alt_text: "" }] : [],
  );
  const [date, setDate] = useState(delivery?.scheduled_date ?? initialDate ?? "");
  const [slot, setSlot] = useState<"morning" | "afternoon" | "evening" | "">(delivery?.time_slot ?? "");
  const [postDraft, setPostDraft] = useState<PostDraft | null>(delivery ? { ...EMPTY(delivery.channel), hashtags: delivery.hashtags.join(", "), call_to_action_link: delivery.call_to_action_link ?? "", call_to_action_caption: delivery.call_to_action_caption ?? "" } : null);
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const activeCampaigns = campaigns.filter((campaign) => campaign.status !== "archived" && campaign.status !== "completed");
  const selectedCampaignStatus = delivery?.campaign_status ?? campaigns.find((campaign) => campaign.id === campaignId)?.status;
  const campaignCanSchedule = selectedCampaignStatus === "active";
  const selectedChannel = postDraft?.channel ?? "";
  const labelDate = date || new Date().toISOString().slice(0, 10);
  const selectChannel = (channel: SocialPostChannel | "") => {
    const previousChannel = postDraft?.channel;
    if (channel && previousChannel) {
      const previousKind = mediaKindFor(previousChannel);
      const nextKind = mediaKindFor(channel);
      if (nextKind !== "image_or_video" && previousKind !== nextKind) {
        setMediaItems([]);
      }
    }
    setPostDraft((current) => channel ? { ...(current ?? EMPTY(channel)), channel } : null);
  };
  const updatePostDraft = (changes: Partial<PostDraft>) => setPostDraft((current) => current ? { ...current, ...changes } : null);
  const effective = postDraft ? {
    ...postDraft, caption: sharedCaption,
    media_url: mediaItems[0]?.url ?? "", media_items: mediaItems,
  } : null;
  const selectedMediaUrls = mediaItems.map(item => item.url);
  const setSelectedMediaUrls = (urls: string[]) => setMediaItems(current => {
    const altByUrl = new Map(current.map(item => [item.url, item.alt_text]));
    return urls.map(url => ({ url, alt_text: altByUrl.get(url) ?? "" }));
  });
  const moveMedia = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= selectedMediaUrls.length) return;
    const urls = [...selectedMediaUrls];
    [urls[index], urls[destination]] = [urls[destination], urls[index]];
    setSelectedMediaUrls(urls);
  };

  const submit = async (mode: "draft" | "scheduled") => {
    if (!campaignId) return toast.error("Select a campaign.");
    if (!title.trim()) return toast.error("Enter an internal title.");
    if (!effective) return toast.error("Select a platform.");
    if (mode === "scheduled" && date && slot && Date.parse(scheduledAtFor(date, slot)) <= Date.now()) return toast.error("Choose a future time slot.");
    setSaving(true);
    if (delivery) {
      const variant = effective;
      const result = await updateSocialPost({
        id: delivery.id, version: delivery.version,
        title, description, caption: variant.caption, media_url: variant.media_url, media_items: variant.media_items,
        hashtags: variant.hashtags.split(",").map((item) => item.trim().replace(/^#/, "")).filter(Boolean),
        call_to_action_link: variant.call_to_action_link, call_to_action_caption: variant.call_to_action_caption,
        channel: variant.channel, scheduled_date: date || null, time_slot: slot || null,
        status: mode,
      });
      setSaving(false);
      if (!result?.data || result.data.error) return toast.error(result?.data?.error || result?.serverError || "Unable to save post.");
      const schedulePlatform = variant.channel.startsWith("instagram_") ? "instagram" : variant.channel === "whatsapp" ? "whatsapp" : "tiktok";
      onUpdated?.({ ...delivery, version: result?.data?.data?.version ?? delivery.version + 1, needs_review: mode === "scheduled" ? false : delivery.needs_review, review_reason: mode === "scheduled" ? null : delivery.review_reason, post_title: title, description, caption: variant.caption, media_url: variant.media_url || null, media_items: variant.media_items, hashtags: variant.hashtags.split(",").map((item) => item.trim().replace(/^#/, "")).filter(Boolean), call_to_action_link: variant.call_to_action_link || null, call_to_action_caption: variant.call_to_action_caption || null, channel: variant.channel, schedule_platform: schedulePlatform, scheduled_date: date || null, time_slot: slot || null, scheduled_at: mode === "scheduled" && date && slot ? scheduledAtFor(date, slot) : null, status: mode });
      toast.success(mode === "scheduled" ? "Post scheduled." : "Draft saved.");
      onClose();
      return;
    }
    const variant = effective;
    const result = await createManualSocialPost({
      campaign_id: campaignId, title, description, scheduled_date: date || null, time_slot: slot || null, mode,
      channel: variant.channel, caption: variant.caption, media_url: variant.media_url, media_items: variant.media_items, hashtags: variant.hashtags.split(",").map((item) => item.trim().replace(/^#/, "")).filter(Boolean), call_to_action_link: variant.call_to_action_link, call_to_action_caption: variant.call_to_action_caption,
    });
    if (!result?.data || result.data.error) { setSaving(false); return toast.error(result?.data?.error || result?.serverError || "Unable to save post."); }
    const refreshed = await getSocialCalendarPosts();
    setSaving(false);
    if (refreshed?.data?.data) onCreated?.(refreshed.data.data);
    toast.success(mode === "scheduled" ? "Post scheduled." : "Draft saved.");
    onClose();
  };
  const remove = async () => {
    if (!delivery) return;
    if (!window.confirm("Remove this post from the campaign calendar?")) return;
    setSaving(true);
    const result = await deleteSocialPost({ id: delivery.id });
    setSaving(false);
    if (!result?.data || result.data.error) return toast.error(result?.data?.error || result?.serverError || "Unable to save post.");
    onDeleted?.(delivery.id); onClose(); toast.success("Post removed from the calendar.");
  };
  const locked = Boolean(delivery && ["due", "processing", "provider_processing", "sent", "skipped"].includes(delivery.status));

  return ( <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="manual-post-title" className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between"><div><h2 id="manual-post-title" className="text-xl font-semibold text-ink">{delivery ? "Edit campaign post" : "New campaign post"}</h2><p className="text-sm text-muted">Required fields depend on the selected platform.</p></div><button type="button" onClick={onClose} className="px-3 py-2 text-sm text-muted">Close</button></div>
        {delivery?.needs_review && <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{delivery.review_reason ?? "Review this post's content and date before publishing."}</p>}
        {delivery?.status === "failed" && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">{delivery.retryable ? `Retry pending after attempt ${delivery.attempt_count} of 3` : "Manual intervention required"}</p><p className="mt-1 text-xs">{delivery.provider_error ?? "The provider did not return an error message."}</p>{!delivery.retryable && canPublish && <p className="mt-1 text-xs">Correct the content or configuration, then schedule the post again to start a fresh attempt cycle.</p>}</div>}
        <fieldset disabled={locked || saving || !canEdit} className="grid gap-4 disabled:opacity-75 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">Campaign<select value={campaignId} disabled={Boolean(delivery)} onChange={(event) => setCampaignId(event.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal">{delivery && <option value={delivery.campaign_id}>{delivery.campaign_name}</option>}<option value="">Select campaign</option>{activeCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">Internal title<input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Content brief<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">
            Caption/message{" "}
            <span className="font-normal text-red-600">Required to schedule</span>
            <textarea value={sharedCaption} onChange={(event) => setSharedCaption(event.target.value)} rows={3} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" />
          </label>
          <div className="flex flex-col gap-2 text-sm font-medium text-ink md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                Media{" "}
                <span className="font-normal text-muted">{selectedChannel === "instagram_feed" ? "Up to 10 images; the first is the carousel cover." : selectedChannel === "whatsapp" ? "Optional" : "Required to schedule except WhatsApp"}</span>
              </div>
              {canEdit && <button type="button" disabled={!selectedChannel} onClick={() => setMediaPickerOpen(true)} className="rounded-lg border border-teal px-3 py-2 text-xs font-semibold text-teal disabled:opacity-40">Choose from Storage</button>}
            </div>
            {selectedMediaUrls.length ? <div className="space-y-2">{selectedMediaUrls.map((url, index) => <div key={`${url}-${index}`} className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-2"><div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">{isVideoUrl(url) ? <video src={url} muted preload="metadata" className="h-full w-full object-cover" /> : <Image src={url} alt="" fill sizes="56px" className="object-cover" />}</div><p className="min-w-0 flex-1 truncate text-xs font-normal text-muted">{url.split("/").at(-1)}</p>{selectedChannel === "instagram_feed" && <div className="flex gap-1"><button type="button" disabled={index === 0} onClick={() => moveMedia(index, -1)} className="rounded border border-line px-2 py-1 disabled:opacity-30" aria-label="Move image earlier">↑</button><button type="button" disabled={index === selectedMediaUrls.length - 1} onClick={() => moveMedia(index, 1)} className="rounded border border-line px-2 py-1 disabled:opacity-30" aria-label="Move image later">↓</button></div>}<button type="button" onClick={() => setSelectedMediaUrls(selectedMediaUrls.filter((_, itemIndex) => itemIndex !== index))} className="rounded border border-red-200 px-2 py-1 text-xs text-red-700">Remove</button></div>)}</div> : <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs font-normal text-muted">No media selected.</p>}
          </div>
          {selectedChannel.startsWith("instagram_") && selectedChannel !== "instagram_reel" && (<label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">
                Image alt text{" "}
                <span className="font-normal text-red-600">Required to schedule; one line per image</span>
                <textarea
                  value={mediaItems.map(item => item.alt_text).join("\n")}
                  onChange={(event) => {
                    const lines = event.target.value.split(/\r?\n/);
                    setMediaItems(current => current.map((item, index) => ({ ...item, alt_text: lines[index] ?? "" })));
                  }} rows={selectedChannel === "instagram_feed" ? 4 : 2} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" placeholder={selectedChannel === "instagram_feed" ? "Description for image 1\nDescription for image 2" : "Describe the image for screen-reader users"}
                />
              </label>
            )}
           <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Platform and format<select value={selectedChannel} onChange={(event) => selectChannel(event.target.value as SocialPostChannel | "")} className="rounded-xl border border-line bg-white px-3 py-2 font-normal"><option value="">Select one platform</option><option value="instagram_feed">Instagram Feed</option><option value="instagram_story">Instagram Story</option><option value="instagram_reel">Instagram Reel</option><option value="whatsapp">WhatsApp</option><option value="tiktok_reel">TikTok Reel</option></select></label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Time slot{" "}
            <select value={slot} onChange={(event) => setSlot(event.target.value as typeof slot)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal"><option value="">Select slot</option><option value="morning">{localSlotLabel(labelDate, "morning")}</option><option value="afternoon">{localSlotLabel(labelDate, "afternoon")}</option><option value="evening">{localSlotLabel(labelDate, "evening")}</option></select>
          </label>
        </fieldset>
        {postDraft && postDraft.channel !== "whatsapp" && <fieldset disabled={locked || saving || !canEdit} className="mt-5 grid gap-3 rounded-xl border border-line p-4 disabled:opacity-75 md:grid-cols-2"><legend className="px-1 text-sm font-semibold text-ink">Optional platform details</legend><label className="flex flex-col gap-1 text-xs font-semibold text-muted">Hashtags<input value={postDraft.hashtags} onChange={(event) => updatePostDraft( { hashtags: event.target.value })} placeholder="community, event" className="rounded-lg border border-line px-3 py-2 font-normal text-ink" /></label><label className="flex flex-col gap-1 text-xs font-semibold text-muted">CTA label<input value={postDraft.call_to_action_caption} onChange={(event) => updatePostDraft( { call_to_action_caption: event.target.value })} className="rounded-lg border border-line px-3 py-2 font-normal text-ink" /></label><label className="flex flex-col gap-1 text-xs font-semibold text-muted md:col-span-2">CTA link<input type="url" value={postDraft.call_to_action_link} onChange={(event) => updatePostDraft( { call_to_action_link: event.target.value })} className="rounded-lg border border-line px-3 py-2 font-normal text-ink" /></label></fieldset>}
        {delivery &&
          canEdit &&
          onCopied &&
          !["archived", "completed"].includes(delivery.campaign_status) && (
            <div className="mt-5 rounded-xl border border-line p-4">
              <button
                type="button"
                disabled={saving || !effective}
                onClick={() => setCopying(true)}
                className="rounded-xl border border-teal px-4 py-2 text-sm font-semibold text-teal-dark disabled:opacity-50"
              >
                Copy post details
              </button>
              <p className="mt-2 text-xs text-muted">
                Choose fields and other posts in this campaign. Copying uses the
                current form values and does not save changes to this source
                post.
              </p>
            </div>
          )}
        {delivery?.status === "scheduled" && <p className="mt-4 text-xs text-amber-700">Saving as a draft stops scheduled publication until a publisher approves it again.</p>}
        {!campaignCanSchedule && campaignId && <p className="mt-4 text-xs text-amber-700">Activate this campaign before scheduling its posts.</p>}
        {canPublish && selectedChannel === "whatsapp" && (
          <p className="mt-4 text-xs text-muted">
            Approving records you as the publisher and sends from your paired WhatsApp account.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <div>{delivery && canDelete && !locked && <button type="button" disabled={saving} onClick={remove} className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700">Delete post</button>}</div>
          <div className="flex gap-2">
            {canEdit && !locked && (
              <>
                <button type="button" disabled={saving} onClick={() => submit("draft")} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">Save draft</button>
                {canPublish && ( <button type="button" disabled={saving || !campaignCanSchedule} onClick={() => submit("scheduled")} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    { selectedChannel === "whatsapp" ? "Approve & schedule as me" : "Approve & schedule"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
      {copying && delivery && effective && onCopied && (
        <CopyPostDetailsModal
          source={delivery}
          details={{
            description,
            caption: effective.caption,
            media_items: effective.media_items,
            hashtags: effective.hashtags
              .split(",")
              .map((item) => item.trim().replace(/^#/, ""))
              .filter(Boolean),
            call_to_action_link: effective.call_to_action_link,
            call_to_action_caption: effective.call_to_action_caption,
          }}
          canPublish={canPublish}
          onClose={() => setCopying(false)}
          onCopied={(posts) => {
            setCopying(false);
            onCopied(posts);
            toast.success("Details applied to selected posts.");
          }}
        />
      )}
      {mediaPickerOpen && (
        <StorageMediaPicker
          context="social" selectedUrls={selectedMediaUrls} maximum={selectedChannel === "instagram_feed" ? 10 : 1} mediaKind={mediaKindFor(selectedChannel as SocialPostChannel)}
          instagramPortrait={selectedChannel === "instagram_feed"} onChange={setSelectedMediaUrls} onClose={() => setMediaPickerOpen(false)}
        />
      )}
    </div>
  );
}
