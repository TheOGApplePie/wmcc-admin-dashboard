"use client";

import { useState, useMemo, useEffect } from "react";
import {
  SocialPost,
  SocialPostStatus,
  CHANNEL_LABELS,
  CHANNEL_COLOURS_HEX,
  POST_TYPE_LABELS,
  POST_TYPE_COLOURS,
} from "@/app/schemas/socialPosts";
import type { PostQueueProps } from "@/features/socialPosts/types";
import { publishSocialPost } from "@/actions/socialPosts";
import SocialPostStatusBadge from "./SocialPostStatusBadge";
import toast from "react-hot-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " +
    formatTime(iso)
  );
}

// ─── Sorting / filtering ──────────────────────────────────────────────────────

const STATUS_SORT_ORDER: Record<SocialPostStatus, number> = {
  idea:      0,
  draft:     0,
  scheduled: 1,
  published: 2,
  failed:    2,
};

const PAGE_SIZES = [10, 20, 30] as const;
type PageSize = (typeof PAGE_SIZES)[number];

type StatusFilter = SocialPostStatus | "all";

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all",       label: "All"       },
  { value: "draft",     label: "Draft"     },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "failed",    label: "Failed"    },
];

function filterAndSort(posts: SocialPost[], filter: StatusFilter): SocialPost[] {
  const arr =
    filter === "all"
      ? posts
      : posts.filter(
          (p) => p.status === filter || (filter === "draft" && p.status === "idea"),
        );
  return [...arr].sort((a, b) => {
    const ao = STATUS_SORT_ORDER[a.status] ?? 3;
    const bo = STATUS_SORT_ORDER[b.status] ?? 3;
    if (ao !== bo) return ao - bo;
    if (a.status === "scheduled" && b.status === "scheduled") {
      return (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "");
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

// ─── Single post card ─────────────────────────────────────────────────────────

function QueueItem({
  post,
  selected,
  onSelect,
  onMarkSent,
}: Readonly<{
  post:       SocialPost;
  selected:   boolean;
  onSelect:   () => void;
  onMarkSent: (updated: SocialPost) => void;
}>) {
  const [marking, setMarking] = useState(false);

  const handleMarkSent = async () => {
    setMarking(true);
    const result = await publishSocialPost({ id: post.id });
    setMarking(false);
    if (result?.data?.error) { toast.error(result.data.error); return; }
    if (result?.data?.data)  { toast.success("Post marked as sent."); onMarkSent(result.data.data); }
  };

  return (
    <div
      className={`w-full rounded-xl border-[1.5px] transition-colors duration-150 ${
        selected
          ? "bg-(--sp-teal-soft) border-(--sp-teal)"
          : "bg-transparent border-transparent hover:bg-(--sp-canvas)"
      }`}
    >
      {/* Clickable card area — semantic button for keyboard + screen-reader access */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Select post: ${post.title}`}
        className="w-full text-left flex gap-3 p-3"
      >
        {/* Thumbnail */}
        <div
          className="rounded-xl shrink-0 overflow-hidden"
          style={{ width: 52, height: 52, backgroundColor: "var(--sp-hairline)" }}
        >
          {post.media_url ? (
            <img src={post.media_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sp-muted)" strokeWidth="1.5">
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
            <span className="text-[13px] font-semibold truncate" style={{ color: "var(--sp-ink)" }}>
              {post.title}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {post.post_type && post.post_type !== "GENERAL" && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: POST_TYPE_COLOURS[post.post_type] + "18",
                    color:           POST_TYPE_COLOURS[post.post_type],
                  }}
                >
                  {POST_TYPE_LABELS[post.post_type]}
                </span>
              )}
              <SocialPostStatusBadge status={post.status} />
            </div>
          </div>

          {post.caption && (
            <p className="text-[12px] line-clamp-1 mb-1.5" style={{ color: "var(--sp-muted)" }}>
              {post.caption}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {post.channels.map((ch) => (
              <span
                key={ch}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  backgroundColor: CHANNEL_COLOURS_HEX[ch] + "18",
                  color:           CHANNEL_COLOURS_HEX[ch],
                }}
              >
                {CHANNEL_LABELS[ch]}
              </span>
            ))}
            {post.scheduled_at && (
              <span className="text-[11px] ml-auto" style={{ color: "var(--sp-muted)" }}>
                {formatDateTime(post.scheduled_at)}
              </span>
            )}
          </div>

          {post.event_title && (
            <div className="mt-1.5">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                style={{ backgroundColor: "#EDE9FE", color: "var(--sp-violet)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8"  y1="2" x2="8"  y2="6" />
                  <line x1="3"  y1="10" x2="21" y2="10" />
                </svg>
                {post.event_title}
              </span>
            </div>
          )}
        </div>
      </button>

      {/* Mark as sent — sibling of the card button, not nested inside it */}
      {post.status === "scheduled" && (
        <div className="px-3 pb-3">
          <button
            type="button"
            disabled={marking}
            onClick={handleMarkSent}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colours"
            style={{ borderColor: "var(--sp-teal)", color: "var(--sp-teal)", backgroundColor: "transparent" }}
          >
            {marking ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            Mark as sent
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-centre rounded-2xl"
      style={{ border: "1.5px dashed var(--sp-hairline)" }}
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--sp-muted)" strokeWidth="1.5" className="mb-3 opacity-50">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
      <p className="text-[14px] font-medium" style={{ color: "var(--sp-muted)" }}>No posts yet</p>
      <p className="text-[12px] mt-1" style={{ color: "var(--sp-muted)", opacity: 0.7 }}>
        Click &ldquo;New post&rdquo; to get started.
      </p>
    </div>
  );
}

// ─── Main queue ───────────────────────────────────────────────────────────────

export default function PostQueue({ posts, selectedId, onSelect, onMarkSent }: PostQueueProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pageSize, setPageSize]         = useState<PageSize>(10);
  const [page, setPage]                 = useState(1);

  const filtered    = useMemo(() => filterAndSort(posts, statusFilter), [posts, statusFilter]);
  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated   = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 whenever the filter or page size changes.
  useEffect(() => { setPage(1); }, [statusFilter, pageSize]);

  if (posts.length === 0) return <EmptyState />;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap shrink-0">
        {/* Status filter chips */}
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map(({ value, label }) => {
            const count =
              value === "all"
                ? posts.length
                : posts.filter(
                    (p) => p.status === value || (value === "draft" && p.status === "idea"),
                  ).length;
            if (count === 0 && value !== "all") return null;
            const active = statusFilter === value;
            return (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                style={active
                  ? { backgroundColor: "var(--sp-teal)", color: "var(--sp-surface)" }
                  : { backgroundColor: "var(--sp-hairline)", color: "var(--sp-muted)" }
                }
              >
                {label}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Page size selector */}
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
          className="text-[11px] rounded-lg px-2 py-1 border outline-none"
          style={{
            borderColor:     "var(--sp-hairline)",
            color:           "var(--sp-muted)",
            backgroundColor: "var(--sp-surface)",
          }}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s} per page</option>
          ))}
        </select>
      </div>

      {/* ── Post list ─────────────────────────────────────────────────────── */}
      {paginated.length === 0 ? (
        <p className="py-8 text-centre text-[13px]" style={{ color: "var(--sp-muted)" }}>
          No {statusFilter === "all" ? "" : statusFilter} posts found.
        </p>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: "calc(100dvh - 360px)" }}>
          {paginated.map((p) => (
            <QueueItem
              key={p.id}
              post={p}
              selected={selectedId === p.id}
              onSelect={() => onSelect(p)}
              onMarkSent={onMarkSent}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-centre justify-centre gap-3 pt-1 shrink-0">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-1.5 rounded-lg disabled:opacity-30 transition-colours"
            style={{ backgroundColor: "var(--sp-hairline)" }}
            aria-label="Previous page"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--sp-muted)" }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-1.5 rounded-lg disabled:opacity-30 transition-colours"
            style={{ backgroundColor: "var(--sp-hairline)" }}
            aria-label="Next page"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
