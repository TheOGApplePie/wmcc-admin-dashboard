"use client";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { EventClickArg } from "@fullcalendar/core";
import { useRef, useState, useMemo } from "react";
import toast from "react-hot-toast";
import { ScheduledPost, PostType, PostStatus } from "@/app/schemas/postScheduling";
import {
  revertPostToDraft,
  markPostManualSent,
  bulkDeletePosts,
} from "@/actions/postScheduling";
import { checkWeeklyConstraints, isRevertable } from "@/features/postScheduling/constraintEngine";
import PostModal from "./PostModal";
import PostStatusBadge from "./PostStatusBadge";
import PlatformIcons from "./PlatformIcons";

const TYPE_BG: Record<PostType, string> = {
  ANNOUNCEMENT: "#8b5cf6",
  GENERAL:      "#0ea5e9",
  REMINDER:     "#f97316",
};

const STATUS_BORDER: Record<PostStatus, string> = {
  draft:     "#6b7280",
  scheduled: "#f59e0b",
  posted:    "#22c55e",
  failed:    "#ef4444",
};

const ALL_STATUSES: PostStatus[] = ["draft", "scheduled", "posted", "failed"];

function isStuck(post: ScheduledPost): boolean {
  return (
    post.status === "scheduled" &&
    new Date(post.scheduled_at) < new Date() &&
    new Date(post.updated_at).getTime() < Date.now() - 2 * 60 * 60 * 1000
  );
}

function toFCEvent(post: ScheduledPost) {
  return {
    id: String(post.id),
    title: `[${post.post_type[0]}] ${post.time_slot}`,
    start: post.scheduled_at,
    backgroundColor: TYPE_BG[post.post_type],
    borderColor: STATUS_BORDER[post.status],
    editable: false,
    extendedProps: { post },
  };
}

interface PostsCalendarProps {
  posts: ScheduledPost[];
  campaignId: number;
  eventId: number;
  currentUserEmail: string | null;
  onRefresh: () => void;
}

export default function PostsCalendar({
  posts,
  campaignId,
  eventId,
  currentUserEmail,
  onRefresh,
}: PostsCalendarProps) {
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);

  const openModal = (post?: ScheduledPost) => {
    setSelectedPost(post);
    setShowAdd(!post);
    modalRef.current?.showModal();
  };

  const closeModal = (reload: boolean) => {
    modalRef.current?.close();
    if (reload) onRefresh();
  };

  const handleEventClick = (info: EventClickArg) => {
    openModal(info.event.extendedProps.post as ScheduledPost);
  };

  const handleRevert = async (post: ScheduledPost, e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await revertPostToDraft({ id: post.id });
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success("Post reverted to draft.");
      onRefresh();
    }
  };

  const handleMarkSent = async (post: ScheduledPost, e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await markPostManualSent({ id: post.id });
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success("Post marked as sent.");
      onRefresh();
    }
  };

  const handleBulkDelete = async (statuses: ("draft" | "scheduled")[]) => {
    const label = statuses.join(" & ");
    if (!confirm(`Delete all ${label} posts? This cannot be undone.`)) return;
    const result = await bulkDeletePosts({ campaign_id: campaignId, statuses });
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success("Posts deleted.");
      onRefresh();
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  const weekConstraints = useMemo(
    () => checkWeeklyConstraints(posts, todayStr),
    [posts, todayStr],
  );

  const hasDrafts = posts.some((p) => p.status === "draft");
  const hasDraftsOrScheduled = posts.some((p) => p.status === "draft" || p.status === "scheduled");

  const filteredPosts = posts.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (assignedToMe && currentUserEmail && p.assigned_to_email !== currentUserEmail) return false;
    return true;
  });

  const hasAssignedToMe = currentUserEmail
    ? posts.some((p) => p.assigned_to_email === currentUserEmail)
    : false;

  return (
    <div className="relative">
      {/* Week constraint summary bar */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs items-center bg-base-200 rounded-lg px-3 py-2">
        <span className="font-semibold opacity-70">This week:</span>
        <span className={weekConstraints.feedCapacityRemaining === 0 ? "text-error" : weekConstraints.feedCapacityRemaining === 1 ? "text-warning" : "text-success"}>
          Feed {weekConstraints.feedPostsThisWeek}/2
        </span>
        <span className="opacity-30">·</span>
        <span className={weekConstraints.storyCapacityRemaining === 0 ? "text-error" : "text-success"}>
          Stories {weekConstraints.storyPostsThisWeek}/5
        </span>
        {weekConstraints.violations.map((v, i) => (
          <span key={i} className="badge badge-error badge-xs">{v}</span>
        ))}
      </div>

      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex gap-4 text-sm items-center">
          {(["ANNOUNCEMENT", "GENERAL", "REMINDER"] as PostType[]).map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: TYPE_BG[t] }}
              />
              {t}
            </span>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          {/* Bulk actions */}
          {hasDraftsOrScheduled && (
            <div className="dropdown dropdown-end">
              <button tabIndex={0} className="btn btn-sm btn-outline">
                Bulk Actions ▾
              </button>
              <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-10 w-52 p-2 shadow border border-base-200">
                {hasDrafts && (
                  <li>
                    <button onClick={() => handleBulkDelete(["draft"])}>
                      Delete all drafts
                    </button>
                  </li>
                )}
                {hasDraftsOrScheduled && (
                  <li>
                    <button onClick={() => handleBulkDelete(["draft", "scheduled"])} className="text-error">
                      Delete all drafts &amp; scheduled
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
          <button className="btn btn-sm btn-success" onClick={() => openModal()}>
            + Add Post
          </button>
        </div>
      </div>

      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        events={posts.map(toFCEvent) as never}
        editable={false}
        eventClick={handleEventClick}
        height="auto"
        eventContent={(info) => {
          const post = info.event.extendedProps.post as ScheduledPost;
          return (
            <div className="p-0.5 text-xs truncate">
              <div className="font-semibold truncate">{info.event.title}</div>
              {post.is_recurring_reminder && (
                <span className="opacity-75">↻ recurring</span>
              )}
            </div>
          );
        }}
      />

      {/* Post list below calendar */}
      {posts.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold">All Posts</h4>
            {/* Status filter chips */}
            <div className="flex gap-1 flex-wrap">
              <button
                className={`btn btn-xs ${statusFilter === "all" ? "btn-neutral" : "btn-ghost"}`}
                onClick={() => setStatusFilter("all")}
              >
                All
              </button>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  className={`btn btn-xs capitalize ${statusFilter === s ? "btn-neutral" : "btn-ghost"}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </button>
              ))}
              {hasAssignedToMe && (
                <button
                  className={`btn btn-xs ${assignedToMe ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setAssignedToMe((v) => !v)}
                >
                  My Tasks
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Slot</th>
                  <th>Platforms</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover cursor-pointer"
                    onClick={() => openModal(post)}
                  >
                    <td>
                      <span
                        className="badge badge-sm text-white"
                        style={{ backgroundColor: TYPE_BG[post.post_type] }}
                      >
                        {post.post_type}
                      </span>
                      {post.is_recurring_reminder && (
                        <span className="ml-1 text-xs opacity-60">↻</span>
                      )}
                      {post.cross_post_facebook && (
                        <span className="ml-1 text-xs opacity-60" title="Also on Facebook">FB</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{post.scheduled_date}</td>
                    <td className="capitalize">{post.time_slot}</td>
                    <td><PlatformIcons platforms={post.platforms} /></td>
                    <td>
                      <div className="flex items-center gap-1">
                        <PostStatusBadge status={post.status} />
                        {isStuck(post) && (
                          <span title="Stuck — scheduled time passed without processing">⚠</span>
                        )}
                        {post.status === "failed" && post.retry_count < 3 && post.next_retry_at && (
                          <span className="text-xs opacity-60">
                            Retry: {new Date(post.next_retry_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[140px]">
                      {post.assigned_to_email ? (
                        <span
                          className={`text-xs truncate block ${
                            post.assigned_to_email === currentUserEmail
                              ? "text-primary font-medium"
                              : "opacity-60"
                          }`}
                          title={post.assigned_to_email}
                        >
                          {post.assigned_to_email.split("@")[0]}
                        </span>
                      ) : post.requires_manual ? (
                        <span className="text-xs opacity-40 italic">unassigned</span>
                      ) : (
                        <span className="text-xs opacity-20">—</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 flex-wrap">
                        {isRevertable(post) && (
                          <button
                            className="btn btn-xs btn-outline"
                            onClick={(e) => handleRevert(post, e)}
                          >
                            Revert
                          </button>
                        )}
                        {post.requires_manual && post.status === "scheduled" && (
                          <>
                            {post.whatsapp_text && (
                              <button
                                className="btn btn-xs btn-ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(post.whatsapp_text!);
                                  toast.success("Copied!");
                                }}
                              >
                                Copy WA
                              </button>
                            )}
                            <button
                              className="btn btn-xs btn-success"
                              onClick={(e) => handleMarkSent(post, e)}
                            >
                              Mark Sent
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <dialog ref={modalRef} className="modal">
        <PostModal
          post={showAdd ? undefined : selectedPost}
          campaignId={campaignId}
          eventId={eventId}
          existingPosts={posts}
          closeModal={closeModal}
        />
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}
