"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { SocialPost, EventOption, CHANNEL_COLORS } from "@/app/schemas/socialPosts";
import { getSocialPosts, fetchEventsForSelect } from "@/actions/socialPosts";
import StatsStrip from "@/features/socialPosts/components/StatsStrip";
import PostQueue from "@/features/socialPosts/components/PostQueue";
import PostComposer from "@/features/socialPosts/components/PostComposer";

// ─── Channel status indicator (top-right, Phase 1: no live connections) ───────

function ChannelIndicator({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label} — not connected (Phase 2)`}>
      <div
        className="w-2 h-2 rounded-full opacity-40"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] font-medium" style={{ color: "#6B726E" }}>{label}</span>
    </div>
  );
}

// ─── Page skeleton ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-4 p-6">
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 h-20 rounded-2xl" style={{ backgroundColor: "#E7E3DA" }} />
        ))}
      </div>
      <div className="flex gap-5 mt-2">
        <div className="flex-[3] h-64 rounded-2xl" style={{ backgroundColor: "#E7E3DA" }} />
        <div className="flex-[2] h-64 rounded-2xl" style={{ backgroundColor: "#E7E3DA" }} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SocialPostsPage() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(async () => {
    const [postsResult, eventsResult] = await Promise.all([
      getSocialPosts({}),
      fetchEventsForSelect({}),
    ]);

    if (postsResult?.data?.error) {
      toast.error("Failed to load posts.");
    } else {
      setPosts(postsResult?.data?.data ?? []);
    }
    setEvents(eventsResult?.data?.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNewPost = () => {
    setSelectedPost(null);
    setIsNew(true);
  };

  const handleSelectPost = (post: SocialPost) => {
    setSelectedPost(post);
    setIsNew(false);
  };

  const handleSaved = (saved: SocialPost) => {
    setIsNew(false);
    setSelectedPost(saved);
    setPosts((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const handleDeleted = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setSelectedPost(null);
    setIsNew(false);
  };

  if (loading) return <Skeleton />;

  return (
    <div
      className="flex flex-col gap-5 p-6"
      style={{ minHeight: "calc(100dvh - 4rem)", backgroundColor: "#F6F4EF", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: "#15201C" }}>
            Social Posts
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "#6B726E" }}>
            Plan &amp; schedule across Instagram and WhatsApp
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Channel status indicators */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-xl" style={{ backgroundColor: "#fff", border: "1px solid #E7E3DA" }}>
            <ChannelIndicator label="IG Feed" color={CHANNEL_COLORS.ig_feed} />
            <ChannelIndicator label="IG Story" color={CHANNEL_COLORS.ig_story} />
            <ChannelIndicator label="WhatsApp" color={CHANNEL_COLORS.whatsapp} />
          </div>

          {/* New post */}
          <button
            onClick={handleNewPost}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all active:scale-95"
            style={{ backgroundColor: "#0F8073" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0B6359")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#0F8073")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New post
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <StatsStrip posts={posts} />

      {/* Main two-column layout */}
      <div className="flex gap-5 flex-1 min-h-0" style={{ alignItems: "flex-start" }}>
        {/* Left — queue (3fr) */}
        <div
          className="flex flex-col gap-3 rounded-2xl p-4 min-w-0"
          style={{
            flex: "3",
            backgroundColor: "#FFFFFF",
            boxShadow: "0 8px 30px -12px rgba(20,32,28,.12)",
          }}
        >
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-[14px] font-semibold" style={{ color: "#15201C" }}>
              Queue
            </h2>
            <span className="text-[12px] tabular-nums" style={{ color: "#6B726E" }}>
              {posts.length} post{posts.length !== 1 ? "s" : ""}
            </span>
          </div>

          <PostQueue
            posts={posts}
            selectedId={isNew ? null : (selectedPost?.id ?? null)}
            onSelect={handleSelectPost}
          />
        </div>

        {/* Right — composer (2fr) */}
        <div style={{ flex: "2", minWidth: 300 }}>
          <PostComposer
            post={isNew ? null : selectedPost}
            isNew={isNew}
            events={events}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        </div>
      </div>
    </div>
  );
}
