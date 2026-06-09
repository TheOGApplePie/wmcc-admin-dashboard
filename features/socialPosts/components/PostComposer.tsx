"use client";

import {
  SocialChannel,
  SocialPostType,
  CHANNEL_LABELS,
  CHANNEL_COLOURS,
  POST_TYPE_LABELS,
  POST_TYPE_COLOURS,
  SLOT_LABELS,
  TimeSlot,
} from "@/app/schemas/socialPosts";
import { usePostForm } from "@/features/socialPosts/hooks/usePostForm";
import { useMediaUpload } from "@/features/socialPosts/hooks/useMediaUpload";
import PostPreview from "./PostPreview";
import { AnnouncementIcon, GeneralIcon, ReminderIcon } from "./icons";
import type { PostComposerProps } from "@/features/socialPosts/types";

const CHANNELS: SocialChannel[]       = ["ig_feed", "ig_story", "whatsapp"];
const TIME_SLOTS: TimeSlot[]          = ["morning", "afternoon", "evening"];
const POST_TYPES: SocialPostType[]    = ["ANNOUNCEMENT", "GENERAL", "REMINDER"];
const MAX_CAPTION                     = 1000;

const POST_TYPE_ICONS: Record<SocialPostType, React.ComponentType> = {
  ANNOUNCEMENT: AnnouncementIcon,
  GENERAL:      GeneralIcon,
  REMINDER:     ReminderIcon,
};

const POST_TYPE_HINTS: Record<SocialPostType, string> = {
  ANNOUNCEMENT: "Important event news",
  GENERAL:      "Regular content",
  REMINDER:     "Event reminder",
};

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyComposer() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full py-20 text-center rounded-2xl"
      style={{ backgroundColor: "var(--sp-canvas)", border: "1.5px dashed var(--sp-hairline)" }}
    >
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--sp-muted)" strokeWidth="1.5" className="mb-3 opacity-40">
        <polyline points="15 10 20 15 15 20" />
        <path d="M4 4v7a4 4 0 0 0 4 4h12" />
      </svg>
      <p className="text-[14px] font-medium" style={{ color: "var(--sp-muted)" }}>
        Select a post or click &ldquo;New post&rdquo;
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PostComposer({
  post, isNew, events, allPosts, adminUsers, onSaved, onDeleted,
}: PostComposerProps) {
  const form = usePostForm({ post, isNew, allPosts, onSaved, onDeleted });
  const media = useMediaUpload({
    channels:   form.watchedChannels,
    onUploaded: (url) => form.setValue("media_url", url, { shouldDirty: true }),
  });

  // Computed at render time — not at module scope — so it never goes stale.
  const today = new Date().toISOString().split("T")[0];

  const {
    register, setValue, formState: { errors },
    watchedChannels, watchedCaption, watchedHashtags, watchedMediaUrl,
    watchedPostType, watchedEventId, watchedPostDate, watchedTimeSlot,
    toggleChannel, handleSaveDraft, handleSaveKeepScheduled, handleSchedule, handleDelete,
    saving, scheduling, isReadOnly, isScheduled, isSlotTaken,
  } = form;

  // Derived display values
  const igSelected    = watchedChannels.some((c) => c === "ig_feed" || c === "ig_story");
  const feedSelected  = watchedChannels.includes("ig_feed");
  const waSelected    = watchedChannels.includes("whatsapp");
  const requiresEvent = watchedPostType === "ANNOUNCEMENT" || watchedPostType === "REMINDER";
  const hashtagCount  = watchedHashtags
    ? watchedHashtags.split(",").filter((h) => h.trim().length > 0).length
    : 0;
  const canSchedule   =
    watchedChannels.length > 0 &&
    (!igSelected || !!watchedMediaUrl) &&
    !!watchedPostDate &&
    !!watchedTimeSlot;

  const captionLabel =
    igSelected && waSelected ? "Caption / Message" :
    igSelected               ? "Caption"           :
    waSelected               ? "Message"           : "Caption / Message";

  const captionHint =
    igSelected && waSelected ? "(Instagram + WhatsApp · max 1,000 chars)" :
    igSelected               ? "(Instagram · max 1,000 chars)"            :
    waSelected               ? "(WhatsApp)"                               :
                               "(select channels above)";

  const mediaHint =
    igSelected ? (watchedMediaUrl ? "(uploaded ✓)" : "(required for Feed & Story)") :
    waSelected ? "(optional)" : "";
  const mediaHintColour = igSelected && !watchedMediaUrl
    ? "var(--sp-coral)"
    : "var(--sp-muted)";

  const mediaDimHint = watchedChannels.includes("ig_story")
    ? "IG Story: 9:16 only · 1080×1920px"
    : feedSelected
    ? "IG Feed: 4:5 (1080×1350) · 1:1 (1080×1080) · 1.91:1 (1080×566)"
    : "";

  const scheduledLabel = isScheduled && post?.scheduled_at
    ? `${post.scheduled_at.split("T")[0]} · ${post.time_slot ?? "unknown slot"}`
    : null;

  if (!isNew && !post) return <EmptyComposer />;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--sp-surface)", boxShadow: "0 8px 30px -12px rgba(20,32,28,.12)" }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--sp-hairline)" }}
      >
        <span className="text-[14px] font-semibold" style={{ color: "var(--sp-ink)" }}>
          {isNew ? "New post" : post?.title || "Edit post"}
        </span>
        {!isNew && post && !isReadOnly && (
          <button
            type="button"
            onClick={handleDelete}
            className="text-[12px] font-medium"
            style={{ color: "var(--sp-coral)" }}
          >
            Delete
          </button>
        )}
      </div>

      {/* ── Scheduled-post warning ────────────────────────────────────────── */}
      {isScheduled && scheduledLabel && (
        <div
          className="mx-5 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px]"
          style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid var(--sp-amber)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-px">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            Scheduled for <strong>{scheduledLabel}</strong>.
            Saving changes below will update this post. Use &ldquo;Save &amp; unschedule&rdquo; to convert it back to a draft.
          </span>
        </div>
      )}

      {/* ── Form fields ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

        {/* 1. Linked Event */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--sp-muted)" }}>
            Linked Event
          </label>
          <select
            {...register("event_id")}
            disabled={isReadOnly}
            className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none border transition-colours"
            style={{
              borderColor:     requiresEvent && !watchedEventId ? "var(--sp-amber)" : watchedEventId ? "var(--sp-violet)" : "var(--sp-hairline)",
              color:           watchedEventId ? "var(--sp-ink)" : "var(--sp-muted)",
              backgroundColor: isReadOnly ? "var(--sp-canvas)" : "var(--sp-surface)",
            }}
          >
            <option value="">No event linked</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
          {requiresEvent && !watchedEventId && !isReadOnly && (
            <p className="text-[11px] mt-1" style={{ color: "var(--sp-amber)" }}>
              Link an event — required to schedule {watchedPostType === "ANNOUNCEMENT" ? "Announcements" : "Reminders"}.
            </p>
          )}
        </div>

        {/* 2. Post Type */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--sp-muted)" }}>
            Post Type
          </div>
          <div className="flex gap-2">
            {POST_TYPES.map((value) => {
              const active  = watchedPostType === value;
              const colour  = POST_TYPE_COLOURS[value];
              const Icon    = POST_TYPE_ICONS[value];
              return (
                <button
                  key={value}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setValue("post_type", value, { shouldDirty: true })}
                  className="flex-1 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150"
                  style={active
                    ? { borderColor: colour, backgroundColor: colour + "0f", color: colour }
                    : { borderColor: "var(--sp-hairline)", backgroundColor: "transparent", color: "var(--sp-muted)" }
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <Icon />
                    <span className="text-[12px] font-semibold">{POST_TYPE_LABELS[value]}</span>
                  </div>
                  <span className="text-[10px]" style={{ color: active ? colour : "var(--sp-muted)", opacity: 0.75 }}>
                    {POST_TYPE_HINTS[value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Channels */}
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--sp-muted)" }}>
            Publish To
          </legend>
          <div className="flex gap-2 flex-wrap">
            {CHANNELS.map((ch) => {
              const active = watchedChannels.includes(ch);
              return (
                <button
                  key={ch}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => toggleChannel(ch)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-150 border"
                  style={active
                    ? { backgroundColor: CHANNEL_COLOURS[ch], borderColor: CHANNEL_COLOURS[ch], color: "var(--sp-surface)" }
                    : { backgroundColor: "transparent", borderColor: "var(--sp-hairline)", color: "var(--sp-muted)" }
                  }
                >
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {CHANNEL_LABELS[ch]}
                </button>
              );
            })}
          </div>
          {errors.channels && (
            <p className="text-[11px] mt-1" style={{ color: "var(--sp-coral)" }}>{errors.channels.message}</p>
          )}
        </fieldset>

        {/* 4. Preview */}
        {watchedChannels.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--sp-muted)" }}>Preview</div>
            <PostPreview channels={watchedChannels} caption={watchedCaption} mediaUrl={watchedMediaUrl || null} />
          </div>
        )}

        {/* 5. Title */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--sp-muted)" }}>
            Title{" "}
            <span className="font-normal normal-case" style={{ opacity: 0.7 }}>(internal reference — not published)</span>
          </label>
          <input
            {...register("title", { required: "Title is required.", maxLength: { value: 120, message: "Max 120 characters." } })}
            disabled={isReadOnly}
            placeholder="What is this post about?"
            className="w-full rounded-xl px-3 py-2 text-[13px] outline-none border transition-colours"
            style={{
              borderColor:     errors.title ? "var(--sp-coral)" : "var(--sp-hairline)",
              color:           "var(--sp-ink)",
              backgroundColor: isReadOnly ? "var(--sp-canvas)" : "var(--sp-surface)",
            }}
          />
          {errors.title && <p className="text-[11px] mt-1" style={{ color: "var(--sp-coral)" }}>{errors.title.message}</p>}
        </div>

        {/* 6. Media */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--sp-muted)" }}>
            Media{" "}
            <span className="font-normal normal-case" style={{ color: mediaHintColour, opacity: 0.85 }}>{mediaHint}</span>
          </label>

          {watchedMediaUrl ? (
            <div className="relative rounded-xl overflow-hidden" style={{ height: 100 }}>
              <img src={watchedMediaUrl} alt="" className="w-full h-full object-cover" />
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    setValue("media_url", "", { shouldDirty: true });
                    media.clearUploadError();
                  }}
                  className="absolute top-2 right-2 rounded-full w-6 h-6 flex items-center justify-center text-white text-[11px]"
                  style={{ backgroundColor: "rgba(0,0,0,.5)" }}
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={media.uploading || isReadOnly}
              onClick={() => media.fileInputRef.current?.click()}
              className="w-full rounded-xl border py-3 flex flex-col items-center gap-1 transition-colours"
              style={{
                borderColor:     igSelected && !watchedMediaUrl ? "var(--sp-coral)" : "var(--sp-hairline)",
                borderStyle:     "dashed",
                backgroundColor: "var(--sp-canvas)",
              }}
            >
              {media.uploading
                ? <span className="loading loading-spinner loading-xs" />
                : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sp-muted)" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                )}
              <span className="text-[11px]" style={{ color: "var(--sp-muted)" }}>
                {media.uploading ? "Uploading…" : "Add image or video"}
              </span>
            </button>
          )}

          <input
            ref={media.fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4"
            className="hidden"
            onChange={media.handleFileChange}
          />

          {media.uploadError && (
            <div
              className="flex items-start gap-2 mt-2 px-3 py-2 rounded-xl text-[12px]"
              style={{ backgroundColor: "#FEE2E0", color: "#B91C1C" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 mt-px">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{media.uploadError}</span>
            </div>
          )}
          {mediaDimHint && !watchedMediaUrl && !media.uploadError && (
            <p className="text-[10px] mt-1" style={{ color: "var(--sp-muted)", opacity: 0.65 }}>{mediaDimHint}</p>
          )}
        </div>

        {/* 7. Caption / Message */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--sp-muted)" }}>
            {captionLabel}{" "}
            <span className="font-normal normal-case" style={{ opacity: 0.7 }}>{captionHint}</span>
          </label>
          <textarea
            {...register("caption", { maxLength: { value: MAX_CAPTION, message: "Max 1,000 characters." } })}
            disabled={isReadOnly}
            placeholder={waSelected && !igSelected ? "Write your message…" : "Write your caption…"}
            rows={4}
            className="w-full rounded-xl px-3 py-2 text-[13px] outline-none border resize-none transition-colours"
            style={{
              borderColor:     errors.caption ? "var(--sp-coral)" : "var(--sp-hairline)",
              color:           "var(--sp-ink)",
              backgroundColor: isReadOnly ? "var(--sp-canvas)" : "var(--sp-surface)",
            }}
          />
          <div className="flex justify-between">
            {errors.caption
              ? <p className="text-[11px]" style={{ color: "var(--sp-coral)" }}>{errors.caption.message}</p>
              : <span />}
            <span
              className="text-[11px] tabular-nums"
              style={{ color: watchedCaption.length > MAX_CAPTION ? "var(--sp-coral)" : "var(--sp-muted)" }}
            >
              {watchedCaption.length} / {MAX_CAPTION}
            </span>
          </div>
        </div>

        {/* 8. Hashtags (IG Feed only) */}
        {feedSelected && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--sp-muted)" }}>
              Hashtags{" "}
              <span className="font-normal normal-case" style={{ opacity: 0.7 }}>(Instagram Feed · comma-separated · max 30)</span>
            </label>
            <textarea
              {...register("hashtags")}
              disabled={isReadOnly}
              placeholder="community, events, wmcc"
              rows={2}
              className="w-full rounded-xl px-3 py-2 text-[13px] outline-none border resize-none transition-colours font-mono"
              style={{ borderColor: "var(--sp-hairline)", color: "var(--sp-ink)", backgroundColor: isReadOnly ? "var(--sp-canvas)" : "var(--sp-surface)" }}
            />
            <p
              className="text-[10px] mt-0.5 text-right tabular-nums"
              style={{ color: hashtagCount > 30 ? "var(--sp-coral)" : "var(--sp-muted)" }}
            >
              {hashtagCount} / 30
            </p>
          </div>
        )}

        {/* 9. Schedule */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--sp-muted)" }}>
            Schedule
          </div>
          <input
            {...register("post_date")}
            type="date"
            disabled={isReadOnly}
            min={today}
            className="w-full rounded-xl px-3 py-2 text-[12px] outline-none border mb-2"
            style={{ borderColor: "var(--sp-hairline)", color: "var(--sp-ink)", backgroundColor: isReadOnly ? "var(--sp-canvas)" : "var(--sp-surface)" }}
          />
          {watchedPostDate ? (
            <div className="flex gap-2">
              {TIME_SLOTS.map((slot) => {
                const active     = watchedTimeSlot === slot;
                const conflicted = isSlotTaken(watchedPostDate, slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setValue("time_slot", slot, { shouldDirty: true })}
                    className="flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-centre transition-all duration-150"
                    style={active
                      ? { borderColor: "var(--sp-teal)", backgroundColor: "var(--sp-teal-soft)", color: "var(--sp-teal)" }
                      : { borderColor: conflicted ? "var(--sp-amber)" : "var(--sp-hairline)", backgroundColor: "transparent", color: "var(--sp-muted)" }
                    }
                  >
                    <span className="text-[11px] font-semibold">{SLOT_LABELS[slot].split(" · ")[0]}</span>
                    <span className="text-[10px]" style={{ opacity: 0.7 }}>{SLOT_LABELS[slot].split(" · ")[1]}</span>
                    {conflicted && (
                      <span className="text-[9px] font-semibold" style={{ color: active ? "var(--sp-teal)" : "var(--sp-amber)" }}>
                        {active ? "conflict" : "post exists"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            !isReadOnly && (
              <p className="text-[11px]" style={{ color: "var(--sp-muted)", opacity: 0.65 }}>
                Select a date to see available slots.
              </p>
            )
          )}
          {watchedPostDate && !watchedTimeSlot && !isReadOnly && (
            <p className="text-[11px] mt-1.5" style={{ color: "var(--sp-muted)", opacity: 0.65 }}>
              Choose a time slot above.
            </p>
          )}
          {watchedPostDate && watchedTimeSlot && isSlotTaken(watchedPostDate, watchedTimeSlot) && (
            <p className="text-[11px] mt-1.5" style={{ color: "var(--sp-amber)" }}>
              Another post is already scheduled for this slot. You can still schedule here.
            </p>
          )}
        </div>

        {/* 10. Assigned To */}
        {adminUsers.length > 0 && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--sp-muted)" }}>
              Assigned To
            </label>
            <select
              {...register("assigned_to")}
              disabled={isReadOnly}
              className="w-full rounded-xl px-3 py-2 text-[12px] outline-none border"
              style={{ borderColor: "var(--sp-hairline)", color: "var(--sp-ink)", backgroundColor: isReadOnly ? "var(--sp-canvas)" : "var(--sp-surface)" }}
            >
              <option value="">Unassigned</option>
              {adminUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      {!isReadOnly && (
        <div className="flex flex-col gap-2 px-5 py-4 border-t shrink-0" style={{ borderColor: "var(--sp-hairline)" }}>
          {requiresEvent && !watchedEventId && (
            <p className="text-[11px] text-centre" style={{ color: "var(--sp-amber)" }}>
              Link an event above before scheduling this {POST_TYPE_LABELS[watchedPostType]}.
            </p>
          )}

          {isScheduled ? (
            /* Two-button UX for scheduled posts */
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || scheduling}
                className="flex-1 rounded-xl py-2 text-[13px] font-semibold border transition-all"
                style={{ borderColor: "var(--sp-amber)", color: "#92400E", backgroundColor: "#FEF3C7" }}
              >
                {saving ? <span className="loading loading-spinner loading-xs" /> : "Save & unschedule"}
              </button>
              <button
                type="button"
                onClick={handleSaveKeepScheduled}
                disabled={saving || scheduling}
                className="flex-1 rounded-xl py-2 text-[13px] font-semibold transition-all"
                style={{ backgroundColor: "var(--sp-teal)", color: "var(--sp-surface)" }}
              >
                {saving ? <span className="loading loading-spinner loading-xs" /> : "Save changes"}
              </button>
            </div>
          ) : (
            /* Standard draft / schedule buttons */
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || scheduling}
                className="flex-1 rounded-xl py-2 text-[13px] font-semibold border transition-all"
                style={{ borderColor: "var(--sp-hairline)", color: "var(--sp-ink)", backgroundColor: "var(--sp-surface)" }}
              >
                {saving ? <span className="loading loading-spinner loading-xs" /> : "Save draft"}
              </button>
              <button
                type="button"
                onClick={handleSchedule}
                disabled={!canSchedule || saving || scheduling}
                className="flex-1 rounded-xl py-2 text-[13px] font-semibold transition-all"
                style={{
                  backgroundColor: canSchedule ? "var(--sp-teal)" : "var(--sp-hairline)",
                  color:           canSchedule ? "var(--sp-surface)" : "var(--sp-muted)",
                }}
              >
                {scheduling ? <span className="loading loading-spinner loading-xs" /> : "Schedule"}
              </button>
            </div>
          )}
        </div>
      )}

      {isReadOnly && (
        <div className="px-5 py-3 border-t" style={{ borderColor: "var(--sp-hairline)", backgroundColor: "var(--sp-canvas)" }}>
          <p className="text-[12px] text-centre" style={{ color: "var(--sp-muted)" }}>This post has been published.</p>
        </div>
      )}
    </div>
  );
}
