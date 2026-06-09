"use client";

import { useState } from "react";
import { SocialPost, CHANNEL_COLOURS } from "@/app/schemas/socialPosts";
import { ErrorBoundary } from "@/app/components/ErrorBoundary";
import StatsStrip from "./StatsStrip";
import PostQueue from "./PostQueue";
import PostComposer from "./PostComposer";
import type { SocialPostsClientProps } from "@/features/socialPosts/types";

function ChannelIndicator({ label, colour }: Readonly<{ label: string; colour: string }>) {
  return (
    <div className="flex items-center gap-1.5" title={`${label} — not connected (Phase 2)`}>
      <div className="w-2 h-2 rounded-full opacity-40" style={{ backgroundColor: colour }} />
      <span className="text-[11px] font-medium" style={{ color: "var(--sp-muted)" }}>{label}</span>
    </div>
  );
}

export default function SocialPostsClient({ initialPosts, events, adminUsers }: SocialPostsClientProps) {
  const [posts, setPosts]               = useState<SocialPost[]>(initialPosts);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [isNew, setIsNew]               = useState(false);

  const handleNewPost = () => { setSelectedPost(null); setIsNew(true); };

  const handleSelectPost = (post: SocialPost) => { setSelectedPost(post); setIsNew(false); };

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

  const handleMarkSent = (updated: SocialPost) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (selectedPost?.id === updated.id) setSelectedPost(updated);
  };

  return (
    <div
      className="flex flex-col gap-5 p-6"
      style={{ minHeight: "calc(100dvh - 4rem)", backgroundColor: "var(--sp-canvas)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: "var(--sp-ink)" }}>
            Social Posts
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--sp-muted)" }}>
            Plan &amp; schedule across Instagram and WhatsApp
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Channel connection status (Phase 1: no live connections) */}
          <div
            className="hidden sm:flex items-center gap-3 px-3 py-2 rounded-xl"
            style={{ backgroundColor: "var(--sp-surface)", border: "1px solid var(--sp-hairline)" }}
          >
            <ChannelIndicator label="IG Feed"  colour={CHANNEL_COLOURS.ig_feed}  />
            <ChannelIndicator label="IG Story" colour={CHANNEL_COLOURS.ig_story} />
            <ChannelIndicator label="WhatsApp" colour={CHANNEL_COLOURS.whatsapp} />
          </div>

          {/* New post button — hover via Tailwind, no DOM mutation */}
          <button
            onClick={handleNewPost}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors active:scale-95 bg-(--sp-teal) hover:bg-(--sp-teal-dark)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5"  y1="12" x2="19" y2="12" />
            </svg>
            New post
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <ErrorBoundary>
        <StatsStrip posts={posts} />
      </ErrorBoundary>

      {/* Main two-column layout */}
      <ErrorBoundary>
        <div className="flex gap-5 flex-1 min-h-0" style={{ alignItems: "flex-start" }}>

          {/* Left — queue (3fr) */}
          <div
            className="flex flex-col gap-3 rounded-2xl p-4 min-w-0"
            style={{
              flex:            "3",
              backgroundColor: "var(--sp-surface)",
              boxShadow:       "0 8px 30px -12px rgba(20,32,28,.12)",
            }}
          >
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--sp-ink)" }}>Queue</h2>
              <span className="text-[12px] tabular-nums" style={{ color: "var(--sp-muted)" }}>
                {posts.length === 1 ? "1 post" : `${posts.length} posts`}
              </span>
            </div>

            <PostQueue
              posts={posts}
              selectedId={isNew ? null : (selectedPost?.id ?? null)}
              onSelect={handleSelectPost}
              onMarkSent={handleMarkSent}
            />
          </div>

          {/* Right — composer (2fr) */}
          <div style={{ flex: "2", minWidth: 300 }}>
            <PostComposer
              post={isNew ? null : selectedPost}
              isNew={isNew}
              events={events}
              allPosts={posts}
              adminUsers={adminUsers}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          </div>
        </div>
      </ErrorBoundary>
    </div>
  );
}
