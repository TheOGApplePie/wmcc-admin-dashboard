"use client";
import { useForm, Controller, useWatch } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  ScheduledPost,
  PostType,
  TimeSlot,
  PlatformType,
} from "@/app/schemas/postScheduling";
import {
  createScheduledPost,
  updateScheduledPost,
  deleteScheduledPost,
  schedulePost,
  revertPostToDraft,
  markPostManualSent,
  assignPost,
  fetchAdminUsers,
} from "@/actions/postScheduling";
import { getAvailableSlotsForDate, isRevertable } from "@/features/postScheduling/constraintEngine";
import PostPreview from "./PostPreview";

const POST_TYPES: PostType[] = ["ANNOUNCEMENT", "GENERAL", "REMINDER"];
const ALL_SLOTS: TimeSlot[] = ["morning", "afternoon", "evening"];
const PLATFORMS: { value: PlatformType; label: string }[] = [
  { value: "instagram_feed",  label: "Instagram Feed" },
  { value: "instagram_story", label: "Instagram Story" },
  { value: "whatsapp",        label: "WhatsApp" },
];

interface PostModalProps {
  post?: ScheduledPost;
  campaignId: number;
  eventId: number;
  existingPosts: ScheduledPost[];
  closeModal: (reload: boolean) => void;
}

type FormData = {
  post_type: PostType;
  platforms: PlatformType[];
  cross_post_facebook: boolean;
  banner_image_url: string;
  caption: string;
  hashtags: string;
  whatsapp_text: string;
  scheduled_date: string;
  time_slot: TimeSlot;
};

export default function PostModal({
  post,
  campaignId,
  eventId,
  existingPosts,
  closeModal,
}: PostModalProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const submitActionRef = useRef<"draft" | "schedule">("draft");

  const [adminUsers, setAdminUsers] = useState<{ id: string; email: string }[]>([]);
  const [assignee, setAssignee] = useState<string | null>(post?.assigned_to_email ?? null);
  const [assigning, setAssigning] = useState(false);
  const [markingSent, setMarkingSent] = useState(false);

  useEffect(() => {
    fetchAdminUsers({}).then((res) => {
      if (res?.data?.users) setAdminUsers(res.data.users);
    });
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormData>({ mode: "onChange" });

  const watched = useWatch({ control });

  useEffect(() => {
    setAssignee(post?.assigned_to_email ?? null);
  }, [post]);

  useEffect(() => {
    if (post) {
      reset({
        post_type: post.post_type,
        platforms: post.platforms,
        cross_post_facebook: post.cross_post_facebook,
        banner_image_url: post.banner_image_url ?? "",
        caption: post.caption ?? "",
        hashtags: (post.hashtags ?? []).join(", "),
        whatsapp_text: post.whatsapp_text ?? "",
        scheduled_date: post.scheduled_date,
        time_slot: post.time_slot,
      });
    } else {
      reset({
        post_type: "GENERAL",
        platforms: ["instagram_feed"],
        cross_post_facebook: false,
        banner_image_url: "",
        caption: "",
        hashtags: "",
        whatsapp_text: "",
        scheduled_date: new Date().toISOString().split("T")[0],
        time_slot: "morning",
      });
    }
  }, [post, reset]);

  const isPosted = post?.status === "posted";
  const isScheduled = post?.status === "scheduled";
  const isFailed = post?.status === "failed";
  const canRevert = post ? isRevertable(post) : false;
  const inProcessingWindow = isScheduled && !canRevert;
  const isReadOnly = isPosted || isScheduled || isFailed;

  const watchedPlatforms = (watched.platforms ?? []) as PlatformType[];
  const showInstagramFields = watchedPlatforms.some((p) =>
    ["instagram_feed", "instagram_story"].includes(p),
  );
  const showWhatsAppField = watchedPlatforms.includes("whatsapp");
  const showCrossPost = watchedPlatforms.some((p) =>
    ["instagram_feed", "instagram_story"].includes(p),
  );

  const watchedDate = watched.scheduled_date ?? new Date().toISOString().split("T")[0];
  const availableSlots = useMemo(
    () => getAvailableSlotsForDate(existingPosts, watchedDate, post?.id),
    [existingPosts, watchedDate, post?.id],
  );
  const allSlotsTaken = availableSlots.length === 0;
  const selectedSlotTaken =
    watched.time_slot !== undefined && !availableSlots.includes(watched.time_slot as TimeSlot);

  const handleAssign = async (email: string | null) => {
    if (!post) return;
    setAssigning(true);
    const result = await assignPost({ id: post.id, assigned_to_email: email });
    setAssigning(false);
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      setAssignee(email);
      toast.success(email ? `Assigned to ${email}.` : "Assignment cleared.");
    }
  };

  const handleRevert = async () => {
    if (!post) return;
    const result = await revertPostToDraft({ id: post.id });
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success("Post reverted to draft.");
      closeModal(true);
    }
  };

  const handleMarkSent = async () => {
    if (!post) return;
    setMarkingSent(true);
    const result = await markPostManualSent({ id: post.id });
    setMarkingSent(false);
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success("Post marked as sent.");
      closeModal(true);
    }
  };

  const onSubmit = async (data: FormData) => {
    const action = submitActionRef.current;

    if (action === "schedule" && selectedSlotTaken) {
      toast.error("Selected slot is already taken. Pick an available slot to schedule.");
      return;
    }

    const hashtags = data.hashtags
      ? data.hashtags.split(",").map((h) => h.trim()).filter(Boolean)
      : [];

    if (post) {
      const updateResult = await updateScheduledPost({
        id: post.id,
        campaign_id: campaignId,
        event_id: eventId,
        post_type: data.post_type,
        platforms: data.platforms,
        cross_post_facebook: data.cross_post_facebook,
        banner_image_url: data.banner_image_url || null,
        caption: data.caption || null,
        hashtags,
        whatsapp_text: data.whatsapp_text || null,
        scheduled_date: data.scheduled_date,
        time_slot: data.time_slot,
        status: "draft",
      });
      if (updateResult?.data?.error) {
        toast.error(updateResult.data.error);
        return;
      }

      if (action === "schedule") {
        const schedResult = await schedulePost({
          id: post.id,
          scheduled_date: data.scheduled_date,
          time_slot: data.time_slot,
        });
        if (schedResult?.data?.error) {
          toast.error(schedResult.data.error);
          return;
        }
        toast.success("Post scheduled.");
      } else {
        toast.success("Draft saved.");
      }
      closeModal(true);
    } else {
      const createResult = await createScheduledPost({
        campaign_id: campaignId,
        event_id: eventId,
        post_type: data.post_type,
        platforms: data.platforms,
        cross_post_facebook: data.cross_post_facebook,
        banner_image_url: data.banner_image_url || null,
        caption: data.caption || null,
        hashtags,
        whatsapp_text: data.whatsapp_text || null,
        scheduled_date: data.scheduled_date,
        time_slot: data.time_slot,
      });
      if (createResult?.data?.error) {
        toast.error(createResult.data.error);
        return;
      }

      if (action === "schedule") {
        const newId = createResult?.data?.id;
        if (newId) {
          const schedResult = await schedulePost({
            id: newId,
            scheduled_date: data.scheduled_date,
            time_slot: data.time_slot,
          });
          if (schedResult?.data?.error) {
            toast.error(schedResult.data.error);
            return;
          }
          toast.success("Post created and scheduled.");
        } else {
          toast.success("Post created. Open it from the list to schedule it.");
        }
      } else {
        toast.success("Draft created.");
      }
      closeModal(true);
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    if (!confirm("Delete this post?")) return;
    const result = await deleteScheduledPost({ id: post.id });
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success("Post deleted.");
      closeModal(true);
    }
  };

  const previewPost = {
    ...watched,
    platforms: watchedPlatforms,
    hashtags: watched.hashtags
      ? watched.hashtags.split(",").map((h: string) => h.trim()).filter(Boolean)
      : [],
    banner_image_url: watched.banner_image_url || null,
    caption: watched.caption || null,
    whatsapp_text: watched.whatsapp_text || null,
  };

  return (
    <div className="modal-box w-full max-w-lg">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg">{post ? "Post Details" : "Add Post"}</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => closeModal(false)}>✕</button>
      </div>

      {/* Status alerts */}
      {isFailed && (
        <div className="alert alert-error text-xs py-2 mb-3 flex justify-between">
          <span>This post failed to publish.</span>
          {canRevert && (
            <button type="button" className="btn btn-xs btn-ghost" onClick={handleRevert}>
              Revert to Draft
            </button>
          )}
        </div>
      )}
      {isScheduled && canRevert && (
        <div className="alert alert-warning text-xs py-2 mb-3 flex justify-between items-center">
          <span>Locked for publishing. Revert to make changes.</span>
          <div className="flex gap-1">
            <button type="button" className="btn btn-xs btn-ghost" onClick={handleRevert}>
              Revert to Draft
            </button>
            <button
              type="button"
              className="btn btn-xs btn-success"
              disabled={markingSent}
              onClick={handleMarkSent}
            >
              {markingSent ? <span className="loading loading-spinner loading-xs" /> : "Mark Sent"}
            </button>
          </div>
        </div>
      )}
      {inProcessingWindow && (
        <div className="alert text-xs py-2 mb-3 flex justify-between items-center">
          <span>Scheduled — mark as sent once posted.</span>
          <button
            type="button"
            className="btn btn-xs btn-success"
            disabled={markingSent}
            onClick={handleMarkSent}
          >
            {markingSent ? <span className="loading loading-spinner loading-xs" /> : "Mark Sent"}
          </button>
        </div>
      )}
      {isPosted && (
        <div className="alert alert-success text-xs py-2 mb-3">
          This post has been published.
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-bordered mb-4">
        <button
          role="tab"
          className={`tab ${activeTab === "edit" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("edit")}
        >
          {isReadOnly ? "Details" : "Edit"}
        </button>
        <button
          role="tab"
          className={`tab ${activeTab === "preview" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
      </div>

      {activeTab === "preview" ? (
        <PostPreview post={previewPost} />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {/* Post type */}
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Post Type</legend>
            <select
              className="select select-bordered w-full"
              {...register("post_type")}
              disabled={isReadOnly}
            >
              {POST_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </fieldset>

          {/* Platforms */}
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Platforms</legend>
            <Controller
              control={control}
              name="platforms"
              rules={{ required: "Select at least one platform." }}
              render={({ field }) => (
                <div className="flex flex-wrap gap-3">
                  {PLATFORMS.map(({ value, label }) => {
                    const checked = field.value?.includes(value) ?? false;
                    return (
                      <label key={value} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={checked}
                          disabled={isReadOnly}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...(field.value ?? []), value]
                              : (field.value ?? []).filter((p) => p !== value);
                            field.onChange(next);
                          }}
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.platforms && (
              <p className="text-error text-sm">{errors.platforms.message}</p>
            )}
          </fieldset>

          {/* Cross-post to Facebook */}
          {(showCrossPost || (isReadOnly && post?.cross_post_facebook)) && (
            <label className="flex items-center gap-2 cursor-pointer pl-1">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                {...register("cross_post_facebook")}
                disabled={isReadOnly}
              />
              <span className="text-sm">Also post to Facebook</span>
            </label>
          )}

          {/* Date + Slot */}
          <div className="flex gap-2">
            <fieldset className="fieldset flex-1">
              <legend className="fieldset-legend">Date</legend>
              <input
                type="date"
                className="input input-bordered w-full"
                {...register("scheduled_date", { required: "Date is required." })}
                disabled={isReadOnly}
              />
            </fieldset>
            <fieldset className="fieldset flex-1">
              <legend className="fieldset-legend">Slot</legend>
              <select
                className="select select-bordered w-full"
                {...register("time_slot")}
                disabled={isReadOnly}
              >
                {ALL_SLOTS.map((s) => {
                  const taken = !availableSlots.includes(s) && s !== post?.time_slot;
                  return (
                    <option key={s} value={s} disabled={taken && !isReadOnly}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                      {taken && !isReadOnly ? " (taken)" : ""}
                    </option>
                  );
                })}
              </select>
              {allSlotsTaken && !isReadOnly && (
                <p className="text-error text-xs mt-1">
                  No slots available on this date — try a different day.
                </p>
              )}
            </fieldset>
          </div>

          {/* Caption + Hashtags (Instagram) */}
          {(showInstagramFields || isReadOnly) && (
            <>
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Caption</legend>
                <textarea
                  className="textarea textarea-bordered w-full"
                  rows={3}
                  maxLength={2200}
                  {...register("caption")}
                  disabled={isReadOnly}
                />
              </fieldset>

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Hashtags (comma-separated)</legend>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  placeholder="#wmcc, #event"
                  {...register("hashtags")}
                  disabled={isReadOnly}
                />
              </fieldset>
            </>
          )}

          {/* WhatsApp text */}
          {(showWhatsAppField || isReadOnly) && (
            <fieldset className="fieldset">
              <legend className="fieldset-legend">WhatsApp Text</legend>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={2}
                maxLength={4096}
                {...register("whatsapp_text")}
                disabled={isReadOnly}
              />
              {isReadOnly && post?.whatsapp_text && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost mt-1 self-start"
                  onClick={() => {
                    navigator.clipboard.writeText(post.whatsapp_text!);
                    toast.success("Copied to clipboard!");
                  }}
                >
                  Copy text
                </button>
              )}
            </fieldset>
          )}

          {/* Banner image URL */}
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Banner Image URL</legend>
            <input
              type="url"
              className="input input-bordered w-full"
              {...register("banner_image_url")}
              disabled={isReadOnly}
            />
          </fieldset>

          {/* Assignment — visible for all posts once saved */}
          {post && (
            <div className="border border-base-300 rounded-lg p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">
                Assigned To
              </p>
              {assignee ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{assignee}</span>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    disabled={assigning}
                    onClick={() => handleAssign(null)}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <p className="text-xs opacity-50">Unassigned</p>
              )}
              <div className="flex gap-2">
                <select
                  className="select select-bordered select-sm flex-1"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleAssign(e.target.value);
                    e.target.value = "";
                  }}
                  disabled={assigning || adminUsers.length === 0}
                >
                  <option value="" disabled>
                    {adminUsers.length === 0 ? "Loading admins…" : "Assign to…"}
                  </option>
                  {adminUsers.map((u) => (
                    <option key={u.id} value={u.email}>
                      {u.email}
                    </option>
                  ))}
                </select>
                {assigning && <span className="loading loading-spinner loading-sm self-center" />}
              </div>
            </div>
          )}

          {/* Draft-only actions */}
          {!isReadOnly && (
            <div className="flex gap-2 mt-2">
              <button
                type="submit"
                className="btn btn-outline flex-1"
                onClick={() => { submitActionRef.current = "draft"; }}
              >
                Save Draft
              </button>
              <button
                type="submit"
                className="btn btn-success flex-1"
                disabled={allSlotsTaken}
                onClick={() => { submitActionRef.current = "schedule"; }}
              >
                Schedule
              </button>
              {post && (
                <button
                  type="button"
                  className="btn btn-error"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
