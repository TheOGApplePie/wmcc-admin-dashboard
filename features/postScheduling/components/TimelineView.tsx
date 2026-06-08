"use client";
import { ScheduledPost, PostType } from "@/app/schemas/postScheduling";
import PostStatusBadge from "./PostStatusBadge";
import PlatformIcons from "./PlatformIcons";

const TYPE_COLOR: Record<PostType, string> = {
  ANNOUNCEMENT: "bg-purple-500",
  GENERAL: "bg-sky-500",
  REMINDER: "bg-orange-500",
};

const TYPE_BORDER: Record<PostType, string> = {
  ANNOUNCEMENT: "border-purple-500",
  GENERAL: "border-sky-500",
  REMINDER: "border-orange-500",
};

interface TimelineViewProps {
  posts: ScheduledPost[];
  onSelect: (post: ScheduledPost) => void;
}

export default function TimelineView({ posts, onSelect }: TimelineViewProps) {
  const sorted = [...posts].sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/50">
        No posts scheduled yet.
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical spine */}
      <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-base-300" />

      <ol className="space-y-6 pl-14">
        {sorted.map((post, idx) => (
          <li key={post.id} className="relative">
            {/* Dot on spine */}
            <span
              className={`absolute -left-9 top-2 w-4 h-4 rounded-full border-2 border-base-100 ${TYPE_COLOR[post.post_type]}`}
            />

            {/* Card */}
            <button
              className={`w-full text-left rounded-xl border-l-4 ${TYPE_BORDER[post.post_type]} bg-base-100 shadow-sm hover:shadow-md transition-shadow p-4`}
              onClick={() => onSelect(post)}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{post.post_type}</span>
                    {post.is_recurring_reminder && (
                      <span className="text-xs opacity-60">↻ recurring</span>
                    )}
                    <PostStatusBadge status={post.status} />
                    {post.retry_count > 0 && (
                      <span className="badge badge-warning badge-xs">
                        retry {post.retry_count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs opacity-60 mt-0.5 capitalize">
                    {post.scheduled_date} · {post.time_slot}
                  </p>
                </div>
                <PlatformIcons platforms={post.platforms} />
              </div>

              {post.caption && (
                <p className="mt-2 text-xs opacity-70 line-clamp-2">{post.caption}</p>
              )}

              {/* Progress connector label between ANNOUNCEMENT → GENERAL, GENERAL → REMINDER */}
              {idx < sorted.length - 1 && (
                <div className="sr-only">
                  Next: {sorted[idx + 1].post_type}
                </div>
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
