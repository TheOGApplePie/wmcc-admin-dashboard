"use client";
import { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import { EventClickArg } from "@fullcalendar/core";
import toast from "react-hot-toast";
import { ScheduledPost, PostType, PostStatus } from "@/app/schemas/postScheduling";
import { fetchAllScheduledPosts } from "@/actions/postScheduling";
import PostDetail from "./PostDetail";

const TYPE_BG: Record<PostType, string> = {
  ANNOUNCEMENT: "#8b5cf6",
  GENERAL: "#0ea5e9",
  REMINDER: "#f97316",
};

const STATUS_BORDER: Record<PostStatus, string> = {
  draft:     "#6b7280",
  scheduled: "#f59e0b",
  posted:    "#22c55e",
  failed:    "#ef4444",
};

type PostWithEvent = ScheduledPost & {
  events?: { id: number; title: string; start_date: string; end_date: string; is_recurring: boolean };
};

function toFCEvent(post: PostWithEvent) {
  return {
    id: String(post.id),
    title: `[${post.post_type[0]}] ${post.events?.title ?? `Event #${post.event_id}`}`,
    start: post.scheduled_at,
    backgroundColor: TYPE_BG[post.post_type],
    borderColor: STATUS_BORDER[post.status],
    editable: false,
    extendedProps: { post },
  };
}

export default function GlobalPostsCalendar() {
  const [posts, setPosts] = useState<PostWithEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<PostWithEvent | null>(null);

  const loadPosts = async () => {
    setLoading(true);
    const res = await fetchAllScheduledPosts({});
    if (res?.data?.error) {
      toast.error(res.data.error);
    } else if (res?.data?.data) {
      setPosts(res.data.data as PostWithEvent[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleEventClick = (info: EventClickArg) => {
    setSelectedPost(info.event.extendedProps.post as PostWithEvent);
  };

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-base-100/60 z-10 rounded-xl">
          <span className="loading loading-spinner loading-md" />
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs mb-4 flex-wrap items-center">
        {(["ANNOUNCEMENT", "GENERAL", "REMINDER"] as PostType[]).map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: TYPE_BG[t] }}
            />
            {t}
          </span>
        ))}
        <span className="opacity-40">|</span>
        {(Object.entries(STATUS_BORDER) as [PostStatus, string][]).map(([s, color]) => (
          <span key={s} className="flex items-center gap-1 capitalize">
            <span
              className="inline-block w-3 h-3 rounded-sm border-2"
              style={{ borderColor: color }}
            />
            {s}
          </span>
        ))}
      </div>

      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        events={posts.map(toFCEvent) as never}
        editable={false}
        eventClick={handleEventClick}
        height="auto"
        eventContent={(info) => {
          const post = info.event.extendedProps.post as PostWithEvent;
          return (
            <div className="p-0.5 text-xs truncate cursor-pointer">
              <div className="font-semibold truncate">{info.event.title}</div>
              <div className="opacity-75 capitalize">{post.time_slot}</div>
            </div>
          );
        }}
      />

      {selectedPost && (
        <PostDetail
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
