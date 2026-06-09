"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import toast from "react-hot-toast";
import {
  SocialPost,
  SocialChannel,
  SocialPostType,
  TimeSlot,
  POST_TYPE_LABELS,
  SLOT_TIMES,
} from "@/app/schemas/socialPosts";
import {
  createSocialPost,
  updateSocialPost,
  deleteSocialPost,
  scheduleSocialPost,
} from "@/actions/socialPosts";
import type { PostFormValues } from "@/features/socialPosts/types";

export type { PostFormValues };

const EMPTY_FORM: PostFormValues = {
  title: "", caption: "", hashtags: "", channels: [],
  post_type: "GENERAL", post_date: "", time_slot: "",
  assigned_to: "", event_id: "", media_url: "",
};

interface UsePostFormOptions {
  post:      SocialPost | null;
  isNew:     boolean;
  allPosts:  SocialPost[];
  onSaved:   (post: SocialPost) => void;
  onDeleted: (id: string) => void;
}

function buildPayload(values: PostFormValues, status: "draft" | "scheduled" = "draft") {
  const scheduledAt = values.post_date && values.time_slot
    ? `${values.post_date}T${SLOT_TIMES[values.time_slot as TimeSlot]}`
    : null;
  const hashtags = values.hashtags
    .split(",")
    .map((h) => h.trim().replace(/^#+/, "").trim())
    .filter((h) => h.length > 0)
    .map((h) => `#${h}`)
    .slice(0, 30);
  return {
    title:        values.title,
    caption:      values.caption,
    hashtags,
    channels:     values.channels,
    post_type:    values.post_type,
    time_slot:    (values.time_slot as TimeSlot) || null,
    scheduled_at: scheduledAt,
    event_id:     values.event_id ? Number(values.event_id) : null,
    assigned_to:  values.assigned_to || null,
    media_url:    values.media_url || null,
    status,
  };
}

export function usePostForm({ post, isNew, allPosts, onSaved, onDeleted }: UsePostFormOptions) {
  const [saving, setSaving]         = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const { register, handleSubmit, control, reset, setValue, formState } =
    useForm<PostFormValues>({ defaultValues: EMPTY_FORM });

  const watchedChannels  = (useWatch({ control, name: "channels"   }) ?? []) as SocialChannel[];
  const watchedCaption   =  useWatch({ control, name: "caption"    }) ?? "";
  const watchedHashtags  =  useWatch({ control, name: "hashtags"   }) ?? "";
  const watchedMediaUrl  =  useWatch({ control, name: "media_url"  }) ?? "";
  const watchedPostType  = (useWatch({ control, name: "post_type"  }) ?? "GENERAL") as SocialPostType;
  const watchedEventId   =  useWatch({ control, name: "event_id"   }) ?? "";
  const watchedPostDate  =  useWatch({ control, name: "post_date"  }) ?? "";
  const watchedTimeSlot  =  useWatch({ control, name: "time_slot"  }) ?? "";

  useEffect(() => {
    if (isNew) {
      reset(EMPTY_FORM);
    } else if (post) {
      reset({
        title:       post.title,
        caption:     post.caption,
        hashtags:    post.hashtags?.map((h) => h.replace(/^#/, "")).join(", ") ?? "",
        channels:    post.channels,
        post_type:   post.post_type ?? "GENERAL",
        post_date:   post.scheduled_at ? post.scheduled_at.split("T")[0] : "",
        time_slot:   post.time_slot ?? "",
        assigned_to: post.assigned_to ?? "",
        event_id:    post.event_id ? String(post.event_id) : "",
        media_url:   post.media_url ?? "",
      });
    }
  }, [post, isNew, reset]);

  const toggleChannel = (ch: SocialChannel) => {
    const next = watchedChannels.includes(ch)
      ? watchedChannels.filter((c) => c !== ch)
      : [...watchedChannels, ch];
    setValue("channels", next, { shouldDirty: true });
  };

  // Save as draft (unschedules if post was previously scheduled).
  const handleSaveDraft = handleSubmit(async (values) => {
    setSaving(true);
    const payload = buildPayload(values, "draft");
    const result = isNew || !post
      ? await createSocialPost(payload)
      : await updateSocialPost({ id: post.id, ...payload });
    setSaving(false);
    if (result?.data?.error) { toast.error(result.data.error); return; }
    if (result?.data?.data)  { toast.success(isNew || !post ? "Draft saved." : "Post unscheduled and saved as draft."); onSaved(result.data.data); }
  });

  // Save changes while keeping the post scheduled.
  const handleSaveKeepScheduled = handleSubmit(async (values) => {
    if (!post || isNew) return;
    if (!values.post_date || !values.time_slot) {
      toast.error("A date and time slot are required to keep this post scheduled.");
      return;
    }
    setSaving(true);
    const payload = buildPayload(values, "scheduled");
    const result = await updateSocialPost({ id: post.id, ...payload });
    setSaving(false);
    if (result?.data?.error) { toast.error(result.data.error); return; }
    if (result?.data?.data)  { toast.success("Scheduled post updated."); onSaved(result.data.data); }
  });

  // Validate and schedule a draft post.
  const handleSchedule = handleSubmit(async (values) => {
    if (values.channels.length === 0) {
      toast.error("Select at least one channel before scheduling.");
      return;
    }
    if (!values.post_date || !values.time_slot) {
      toast.error("Select a date and time slot before scheduling.");
      return;
    }
    const scheduledAt = `${values.post_date}T${SLOT_TIMES[values.time_slot as TimeSlot]}`;
    if (new Date(scheduledAt) <= new Date()) {
      toast.error("Scheduled time must be in the future.");
      return;
    }
    const needsMedia = values.channels.some((c) => c === "ig_feed" || c === "ig_story");
    if (needsMedia && !values.media_url) {
      toast.error("Instagram posts require media. Please upload an image.");
      return;
    }
    if ((values.post_type === "ANNOUNCEMENT" || values.post_type === "REMINDER") && !values.event_id) {
      toast.error(`${POST_TYPE_LABELS[values.post_type]} posts must be linked to an event.`);
      return;
    }

    setScheduling(true);
    let postId = post?.id;
    if (isNew || !post) {
      const createResult = await createSocialPost(buildPayload(values, "draft"));
      if (createResult?.data?.error) { toast.error(createResult.data.error); setScheduling(false); return; }
      postId = createResult?.data?.data?.id;
    } else {
      await updateSocialPost({ id: post.id, ...buildPayload(values, "draft") });
    }
    if (!postId) { toast.error("Failed to create post."); setScheduling(false); return; }

    const schedResult = await scheduleSocialPost({
      id: postId,
      scheduled_at: new Date(scheduledAt).toISOString(),
    });
    setScheduling(false);
    if (schedResult?.data?.error) { toast.error(schedResult.data.error); return; }
    if (schedResult?.data?.data)  { toast.success("Post scheduled!"); onSaved(schedResult.data.data); }
  });

  const handleDelete = async () => {
    if (!post || isNew) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const result = await deleteSocialPost({ id: post.id });
    if (result?.data?.error) { toast.error(result.data.error); return; }
    toast.success("Post deleted.");
    onDeleted(post.id);
  };

  const isSlotTaken = (date: string, slot: string) =>
    allPosts.some(
      (p) =>
        p.status === "scheduled" &&
        p.id !== post?.id &&
        p.time_slot === slot &&
        !!p.scheduled_at &&
        p.scheduled_at.startsWith(date),
    );

  return {
    register, control, setValue, formState,
    watchedChannels, watchedCaption, watchedHashtags, watchedMediaUrl,
    watchedPostType, watchedEventId, watchedPostDate, watchedTimeSlot,
    toggleChannel,
    handleSaveDraft, handleSaveKeepScheduled, handleSchedule, handleDelete,
    saving, scheduling,
    isReadOnly: post?.status === "published",
    isScheduled: post?.status === "scheduled",
    isSlotTaken,
  };
}
