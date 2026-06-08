"use client";

import { SocialPost, CHANNEL_LABELS, CHANNEL_COLORS_HEX as CHANNEL_COLORS } from "@/app/schemas/socialPosts";
import SocialPostStatusBadge from "./SocialPostStatusBadge";

// ─── Grouping logic ───────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function groupPosts(posts: SocialPost[]): {
  today: SocialPost[];
  thisWeek: SocialPost[];
  later: SocialPost[];
  unscheduled: SocialPost[];
} {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const today: SocialPost[] = [];
  const thisWeek: SocialPost[] = [];
  const later: SocialPost[] = [];
  const unscheduled: SocialPost[] = [];

  for (const post of posts) {
    if (!post.scheduled_at) {
      unscheduled.push(post);
      continue;
    }
    const d = new Date(post.scheduled_at);
    if (isSameDay(d, now)) {
      today.push(post);
    } else if (d <= sevenDays) {
      thisWeek.push(post);
    } else {
      later.push(post);
    }
  }

  return { today, thisWeek, later, unscheduled };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + formatTime(iso);
}

// ─── Single row card ──────────────────────────────────────────────────────────

function QueueItem({
  post,
  selected,
  onSelect,
}: Readonly<{
  post: SocialPost;
  selected: boolean;
  onSelect: () => void;
}>) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex gap-3 p-3 rounded-xl transition-all duration-150"
      style={{
        backgroundColor: selected ? "#E4F2EF" : "transparent",
        border: selected ? "1.5px solid #0F8073" : "1.5px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F6F4EF";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
      }}
    >
      {/* Thumbnail */}
      <div
        className="rounded-xl shrink-0 overflow-hidden"
        style={{ width: 52, height: 52, backgroundColor: "#E7E3DA" }}
      >
        {post.media_url ? (
          <img
            src={post.media_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B726E" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: "#15201C" }}
          >
            {post.title}
          </span>
          <SocialPostStatusBadge status={post.status} />
        </div>

        {post.caption && (
          <p
            className="text-[12px] line-clamp-1 mb-1.5"
            style={{ color: "#6B726E" }}
          >
            {post.caption}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Channel chips */}
          {post.channels.map((ch) => (
            <span
              key={ch}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: CHANNEL_COLORS[ch] + "18",
                color: CHANNEL_COLORS[ch],
              }}
            >
              {CHANNEL_LABELS[ch]}
            </span>
          ))}

          {/* Time */}
          {post.scheduled_at && (
            <span className="text-[11px] ml-auto" style={{ color: "#6B726E" }}>
              {formatDateTime(post.scheduled_at)}
            </span>
          )}
        </div>

        {/* Event chip */}
        {post.event_title && (
          <div className="mt-1.5">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
              style={{ backgroundColor: "#EDE9FE", color: "#7A6CD6" }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {post.event_title}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function QueueGroup({
  label,
  posts,
  selectedId,
  onSelect,
}: Readonly<{
  label: string;
  posts: SocialPost[];
  selectedId: string | null;
  onSelect: (post: SocialPost) => void;
}>) {
  if (posts.length === 0) return null;
  return (
    <div>
      <div
        className="text-[11px] font-semibold uppercase tracking-wide px-1 mb-2"
        style={{ color: "#6B726E" }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-1">
        {posts.map((p) => (
          <QueueItem
            key={p.id}
            post={p}
            selected={selectedId === p.id}
            onSelect={() => onSelect(p)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main queue ───────────────────────────────────────────────────────────────

interface PostQueueProps {
  readonly posts: SocialPost[];
  readonly selectedId: string | null;
  readonly onSelect: (post: SocialPost) => void;
}

export default function PostQueue({ posts, selectedId, onSelect }: PostQueueProps) {
  const { today, thisWeek, later, unscheduled } = groupPosts(posts);

  const isEmpty =
    today.length === 0 &&
    thisWeek.length === 0 &&
    later.length === 0 &&
    unscheduled.length === 0;

  if (isEmpty) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center rounded-2xl"
        style={{ border: "1.5px dashed #E7E3DA" }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6B726E"
          strokeWidth="1.5"
          className="mb-3 opacity-50"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
        <p className="text-[14px] font-medium" style={{ color: "#6B726E" }}>
          No posts yet
        </p>
        <p className="text-[12px] mt-1" style={{ color: "#6B726E", opacity: 0.7 }}>
          Click &ldquo;New post&rdquo; to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 280px)" }}>
      <QueueGroup label="Today" posts={today} selectedId={selectedId} onSelect={onSelect} />
      <QueueGroup label="This week" posts={thisWeek} selectedId={selectedId} onSelect={onSelect} />
      <QueueGroup label="Later" posts={later} selectedId={selectedId} onSelect={onSelect} />
      <QueueGroup label="Unscheduled" posts={unscheduled} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
