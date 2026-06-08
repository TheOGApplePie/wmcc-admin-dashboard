"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import toast from "react-hot-toast";
import {
  SocialPost,
  SocialChannel,
  EventOption,
  CHANNEL_LABELS,
  CHANNEL_COLORS,
} from "@/app/schemas/socialPosts";
import {
  createSocialPost,
  updateSocialPost,
  deleteSocialPost,
  scheduleSocialPost,
  uploadSocialPostMedia,
} from "@/actions/socialPosts";
import PostPreview from "./PostPreview";

const CHANNELS: SocialChannel[] = ["ig_feed", "ig_story", "whatsapp"];
const MAX_CAPTION = 2200;

interface FormValues {
  title: string;
  caption: string;
  channels: SocialChannel[];
  scheduled_at: string;
  event_id: string;
  media_url: string;
}

interface PostComposerProps {
  post: SocialPost | null;
  isNew: boolean;
  events: EventOption[];
  onSaved: (post: SocialPost) => void;
  onDeleted: (id: string) => void;
}

export default function PostComposer({ post, isNew, events, onSaved, onDeleted }: PostComposerProps) {
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    defaultValues: {
      title: "",
      caption: "",
      channels: [],
      scheduled_at: "",
      event_id: "",
      media_url: "",
    },
  });

  const watchedChannels = (useWatch({ control, name: "channels" }) ?? []) as SocialChannel[];
  const watchedCaption = useWatch({ control, name: "caption" }) ?? "";
  const watchedMediaUrl = useWatch({ control, name: "media_url" }) ?? "";

  // Sync form to selected post
  useEffect(() => {
    if (isNew) {
      reset({
        title: "",
        caption: "",
        channels: [],
        scheduled_at: "",
        event_id: "",
        media_url: "",
      });
    } else if (post) {
      reset({
        title: post.title,
        caption: post.caption,
        channels: post.channels,
        scheduled_at: post.scheduled_at
          ? new Date(post.scheduled_at).toISOString().slice(0, 16)
          : "",
        event_id: post.event_id ? String(post.event_id) : "",
        media_url: post.media_url ?? "",
      });
    }
  }, [post, isNew, reset]);

  const toggleChannel = (ch: SocialChannel) => {
    const current = watchedChannels;
    const next = current.includes(ch)
      ? current.filter((c) => c !== ch)
      : [...current, ch];
    setValue("channels", next, { shouldDirty: true });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Max file size is 10 MB.");
      return;
    }
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "video/mp4"].includes(file.type)) {
      toast.error("Unsupported file type. Use JPEG, PNG, WebP, or MP4.");
      return;
    }

    setUploading(true);
    const result = await uploadSocialPostMedia({ file });
    setUploading(false);

    if (result?.data?.error) {
      toast.error(result.data.error);
      return;
    }
    if (result?.data?.data?.media_url) {
      setValue("media_url", result.data.data.media_url, { shouldDirty: true });
      toast.success("Media uploaded.");
    }
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const buildPayload = (values: FormValues) => ({
    title: values.title,
    caption: values.caption,
    channels: values.channels,
    scheduled_at: values.scheduled_at || null,
    event_id: values.event_id ? Number(values.event_id) : null,
    media_url: values.media_url || null,
    status: "draft" as const,
  });

  const handleSaveDraft = handleSubmit(async (values) => {
    setSaving(true);
    let result;
    if (isNew || !post) {
      result = await createSocialPost(buildPayload(values));
    } else {
      result = await updateSocialPost({ id: post.id, ...buildPayload(values) });
    }
    setSaving(false);

    if (result?.data?.error) {
      toast.error(result.data.error);
      return;
    }
    if (result?.data?.data) {
      toast.success("Draft saved.");
      onSaved(result.data.data);
    }
  });

  const handleSchedule = handleSubmit(async (values) => {
    // Validate channel + media requirements
    const needsMedia = values.channels.some((c) => c === "ig_feed" || c === "ig_story");
    if (needsMedia && !values.media_url) {
      toast.error("Instagram posts require media. Please upload an image.");
      return;
    }
    if (!values.scheduled_at) {
      toast.error("Please set a publish time before scheduling.");
      return;
    }
    if (new Date(values.scheduled_at) <= new Date()) {
      toast.error("Scheduled time must be in the future.");
      return;
    }

    setScheduling(true);

    // If new post, create it first as draft
    let postId = post?.id;
    if (isNew || !post) {
      const createResult = await createSocialPost(buildPayload(values));
      if (createResult?.data?.error) {
        toast.error(createResult.data.error);
        setScheduling(false);
        return;
      }
      postId = createResult?.data?.data?.id;
    } else {
      // Save latest edits
      await updateSocialPost({ id: post.id, ...buildPayload(values) });
    }

    if (!postId) {
      toast.error("Failed to create post.");
      setScheduling(false);
      return;
    }

    const schedResult = await scheduleSocialPost({
      id: postId,
      scheduled_at: new Date(values.scheduled_at).toISOString(),
    });
    setScheduling(false);

    if (schedResult?.data?.error) {
      toast.error(schedResult.data.error);
      return;
    }
    if (schedResult?.data?.data) {
      toast.success("Post scheduled!");
      onSaved(schedResult.data.data);
    }
  });

  const handleDelete = async () => {
    if (!post || isNew) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;

    const result = await deleteSocialPost({ id: post.id });
    if (result?.data?.error) {
      toast.error(result.data.error);
      return;
    }
    toast.success("Post deleted.");
    onDeleted(post.id);
  };

  const isReadOnly = post?.status === "published";
  const igSelected = watchedChannels.some((c) => c === "ig_feed" || c === "ig_story");
  const canSchedule = watchedChannels.length > 0 && (!igSelected || !!watchedMediaUrl);

  if (!isNew && !post) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full py-20 text-center rounded-2xl"
        style={{ backgroundColor: "#F6F4EF", border: "1.5px dashed #E7E3DA" }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6B726E" strokeWidth="1.5" className="mb-3 opacity-40">
          <polyline points="15 10 20 15 15 20" />
          <path d="M4 4v7a4 4 0 0 0 4 4h12" />
        </svg>
        <p className="text-[14px] font-medium" style={{ color: "#6B726E" }}>
          Select a post or click &ldquo;New post&rdquo;
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{ backgroundColor: "#FFFFFF", boxShadow: "0 8px 30px -12px rgba(20,32,28,.12)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "#E7E3DA" }}>
        <span className="text-[14px] font-semibold" style={{ color: "#15201C" }}>
          {isNew ? "New post" : post?.title || "Edit post"}
        </span>
        {!isNew && post && !isReadOnly && (
          <button
            onClick={handleDelete}
            className="text-[12px] font-medium transition-colors"
            style={{ color: "#DC6B62" }}
          >
            Delete
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {/* Channels */}
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#6B726E" }}>
            Publish to
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
                  style={
                    active
                      ? {
                          backgroundColor: CHANNEL_COLORS[ch],
                          borderColor: CHANNEL_COLORS[ch],
                          color: "#fff",
                        }
                      : {
                          backgroundColor: "transparent",
                          borderColor: "#E7E3DA",
                          color: "#6B726E",
                        }
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
            <p className="text-[11px] mt-1" style={{ color: "#DC6B62" }}>{errors.channels.message}</p>
          )}
        </fieldset>

        {/* Live Preview */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#6B726E" }}>Preview</div>
          <PostPreview
            channels={watchedChannels}
            caption={watchedCaption}
            mediaUrl={watchedMediaUrl || null}
          />
        </div>

        {/* Title */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "#6B726E" }}>
            Title
          </label>
          <input
            {...register("title", { required: "Title is required.", maxLength: { value: 120, message: "Max 120 characters." } })}
            disabled={isReadOnly}
            placeholder="What is this post about?"
            className="w-full rounded-xl px-3 py-2 text-[13px] outline-none border transition-colors"
            style={{ borderColor: errors.title ? "#DC6B62" : "#E7E3DA", color: "#15201C", backgroundColor: isReadOnly ? "#F6F4EF" : "#fff" }}
          />
          {errors.title && <p className="text-[11px] mt-1" style={{ color: "#DC6B62" }}>{errors.title.message}</p>}
        </div>

        {/* Media upload */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "#6B726E" }}>
            Media
            {igSelected && !watchedMediaUrl && (
              <span className="ml-1 font-normal normal-case" style={{ color: "#DC6B62" }}>— required for Instagram</span>
            )}
          </label>

          {watchedMediaUrl ? (
            <div className="relative rounded-xl overflow-hidden" style={{ height: 100 }}>
              <img src={watchedMediaUrl} alt="" className="w-full h-full object-cover" />
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => setValue("media_url", "", { shouldDirty: true })}
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
              disabled={uploading || isReadOnly}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border py-3 flex flex-col items-center gap-1 transition-colors"
              style={{ borderColor: igSelected ? "#E0A53C" : "#E7E3DA", borderStyle: "dashed", backgroundColor: "#F6F4EF" }}
            >
              {uploading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B726E" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              )}
              <span className="text-[11px]" style={{ color: "#6B726E" }}>
                {uploading ? "Uploading…" : "Add media"}
              </span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Caption */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "#6B726E" }}>
            Caption
          </label>
          <textarea
            {...register("caption", { maxLength: { value: MAX_CAPTION, message: "Max 2,200 characters." } })}
            disabled={isReadOnly}
            placeholder="Write your caption…"
            rows={4}
            className="w-full rounded-xl px-3 py-2 text-[13px] outline-none border resize-none transition-colors"
            style={{ borderColor: errors.caption ? "#DC6B62" : "#E7E3DA", color: "#15201C", backgroundColor: isReadOnly ? "#F6F4EF" : "#fff" }}
          />
          <div className="flex justify-between">
            {errors.caption ? (
              <p className="text-[11px]" style={{ color: "#DC6B62" }}>{errors.caption.message}</p>
            ) : <span />}
            <span className="text-[11px] tabular-nums" style={{ color: watchedCaption.length > MAX_CAPTION ? "#DC6B62" : "#6B726E" }}>
              {watchedCaption.length} / {MAX_CAPTION}
            </span>
          </div>
        </div>

        {/* When + Event (side by side) */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "#6B726E" }}>When</label>
            <input
              {...register("scheduled_at")}
              type="datetime-local"
              disabled={isReadOnly}
              className="w-full rounded-xl px-3 py-2 text-[12px] outline-none border"
              style={{ borderColor: "#E7E3DA", color: "#15201C", backgroundColor: isReadOnly ? "#F6F4EF" : "#fff" }}
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: "#6B726E" }}>Link to event</label>
            <select
              {...register("event_id")}
              disabled={isReadOnly}
              className="w-full rounded-xl px-3 py-2 text-[12px] outline-none border"
              style={{ borderColor: "#E7E3DA", color: "#15201C", backgroundColor: isReadOnly ? "#F6F4EF" : "#fff" }}
            >
              <option value="">No event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Footer */}
      {!isReadOnly && (
        <div
          className="flex gap-2 px-5 py-4 border-t shrink-0"
          style={{ borderColor: "#E7E3DA" }}
        >
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || scheduling}
            className="flex-1 rounded-xl py-2 text-[13px] font-semibold border transition-all"
            style={{ borderColor: "#E7E3DA", color: "#15201C", backgroundColor: "#fff" }}
          >
            {saving ? <span className="loading loading-spinner loading-xs" /> : "Save draft"}
          </button>
          <button
            type="button"
            onClick={handleSchedule}
            disabled={!canSchedule || saving || scheduling}
            className="flex-1 rounded-xl py-2 text-[13px] font-semibold text-white transition-all"
            style={{ backgroundColor: canSchedule ? "#0F8073" : "#E7E3DA", color: canSchedule ? "#fff" : "#6B726E" }}
          >
            {scheduling ? <span className="loading loading-spinner loading-xs" /> : "Schedule"}
          </button>
        </div>
      )}

      {isReadOnly && (
        <div className="px-5 py-3 border-t" style={{ borderColor: "#E7E3DA", backgroundColor: "#F6F4EF" }}>
          <p className="text-[12px] text-center" style={{ color: "#6B726E" }}>This post has been published.</p>
        </div>
      )}
    </div>
  );
}
