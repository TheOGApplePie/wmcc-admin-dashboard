"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ScheduledPost, PostCampaign } from "@/app/schemas/postScheduling";
import {
  fetchPostsForEvent,
  fetchCampaignForEvent,
  initializeCampaign,
  fetchCurrentUser,
} from "@/actions/postScheduling";
import PostsCalendar from "@/features/postScheduling/components/PostsCalendar";
import TimelineView from "@/features/postScheduling/components/TimelineView";
import PostModal from "@/features/postScheduling/components/PostModal";

type View = "calendar" | "timeline";

export default function PostSchedulePage() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);

  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [campaign, setCampaign] = useState<PostCampaign | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [view, setView] = useState<View>("calendar");

  // For timeline → open edit modal
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | undefined>(undefined);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);

  // For "Add Post Manually" flow — open add modal after campaign is created
  const addPostModalRef = useRef<HTMLDialogElement>(null);
  const pendingAddPost = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [postsResult, campaignResult, userResult] = await Promise.all([
      fetchPostsForEvent({ event_id: eventId }),
      fetchCampaignForEvent({ event_id: eventId }),
      fetchCurrentUser({}),
    ]);

    if (postsResult?.data?.error) {
      toast.error("Failed to load posts.");
    } else {
      setPosts((postsResult?.data?.data as ScheduledPost[]) ?? []);
    }

    const campaignData = campaignResult?.data?.data ?? null;
    setCampaign(campaignData as PostCampaign | null);
    setCurrentUserEmail(userResult?.data?.email ?? null);
    setLoading(false);

    // If we just created a campaign for manual add, open the modal now
    if (pendingAddPost.current && campaignData) {
      pendingAddPost.current = false;
      addPostModalRef.current?.showModal();
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerateDefault = async () => {
    setInitializing(true);
    const result = await initializeCampaign({ event_id: eventId, generate: true });
    setInitializing(false);

    if (result?.data?.error) {
      toast.error(result.data.error);
      return;
    }
    const conflicts = result?.data?.conflicts ?? [];
    if (conflicts.length) {
      toast(`Schedule created with ${conflicts.length} slot conflict(s). Some posts were skipped.`, { icon: "⚠️" });
    } else {
      toast.success("Default schedule generated.");
    }
    await load();
  };

  const handleAddFirstPost = async () => {
    setInitializing(true);
    const result = await initializeCampaign({ event_id: eventId, generate: false });
    setInitializing(false);

    if (result?.data?.error) {
      toast.error(result.data.error);
      return;
    }
    // Flag that we want to open the add-post modal after load() refreshes campaign
    pendingAddPost.current = true;
    await load();
  };

  const closeAddPostModal = (reload: boolean) => {
    addPostModalRef.current?.close();
    if (reload) load();
  };

  const openTimelinePost = (post: ScheduledPost) => {
    setSelectedPost(post);
    setTimelineModalOpen(true);
  };

  const closeTimelineModal = (reload: boolean) => {
    setTimelineModalOpen(false);
    setSelectedPost(undefined);
    if (reload) load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Post Schedule</h1>

      {!campaign ? (
        <div className="text-center py-20 text-base-content/60">
          <p className="text-lg font-medium mb-1">No post schedule yet for this event.</p>
          <p className="text-sm mb-6">Generate a default schedule or add your first post manually.</p>
          <div className="flex gap-3 justify-center">
            <button
              className="btn btn-primary"
              disabled={initializing}
              onClick={handleGenerateDefault}
            >
              {initializing ? <span className="loading loading-spinner loading-sm" /> : null}
              Generate Default Schedule
            </button>
            <button
              className="btn btn-outline"
              disabled={initializing}
              onClick={handleAddFirstPost}
            >
              Add Post Manually
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* View toggle */}
          <div className="flex gap-2 mb-4">
            <button
              className={`btn btn-sm ${view === "calendar" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
            <button
              className={`btn btn-sm ${view === "timeline" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("timeline")}
            >
              Timeline
            </button>
          </div>

          {view === "calendar" ? (
            <PostsCalendar
              posts={posts}
              campaignId={campaign.id}
              eventId={eventId}
              currentUserEmail={currentUserEmail}
              onRefresh={load}
            />
          ) : (
            <TimelineView posts={posts} onSelect={openTimelinePost} />
          )}

          {/* Timeline post edit modal */}
          {timelineModalOpen && (
            <dialog open className="modal">
              <PostModal
                post={selectedPost}
                campaignId={campaign.id}
                eventId={eventId}
                existingPosts={posts}
                closeModal={closeTimelineModal}
              />
              <form method="dialog" className="modal-backdrop">
                <button onClick={() => closeTimelineModal(false)}>close</button>
              </form>
            </dialog>
          )}

          {/* Add post modal (opened after campaign creation via "Add Post Manually") */}
          <dialog ref={addPostModalRef} className="modal">
            <PostModal
              post={undefined}
              campaignId={campaign.id}
              eventId={eventId}
              existingPosts={posts}
              closeModal={closeAddPostModal}
            />
            <form method="dialog" className="modal-backdrop">
              <button onClick={() => closeAddPostModal(false)}>close</button>
            </form>
          </dialog>
        </>
      )}
    </div>
  );
}
