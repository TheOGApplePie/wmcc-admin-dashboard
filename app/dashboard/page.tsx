import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(isoStr: string) {
  return new Date(isoStr).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const STATUS_BADGE: Record<string, string> = {
  draft:     "badge-ghost",
  scheduled: "badge-warning",
  published: "badge-success",
  failed:    "badge-error",
};

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];
  const fortnight = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [eventsRes, myPostsRes, feedbackRes] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, start_date, end_date, is_recurring")
      .gte("start_date", today)
      .lte("start_date", fortnight)
      .order("start_date")
      .limit(5),
    user?.id
      ? supabase
          .from("social_posts")
          .select("id, title, post_type, time_slot, scheduled_at, status, channels")
          .eq("assigned_to", user.id)
          .in("status", ["draft", "scheduled"])
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at")
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase
      .from("community-feedback")
      .select("id, name, message, created_at")
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const upcomingEvents = eventsRes.data ?? [];
  const myPosts = myPostsRes.data ?? [];
  const recentFeedback = feedbackRes.data ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Assalamualaikum</h1>
      <p className="opacity-60 mb-8 text-sm">
        {new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Upcoming Events ─────────────────────────────────────────── */}
        <div className="card bg-base-100 border border-base-200 shadow-sm">
          <div className="card-body p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="card-title text-base">Upcoming Events</h2>
              <Link href="/dashboard/events" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>

            {upcomingEvents.length === 0 ? (
              <p className="text-sm opacity-50 py-4 text-center">No events in the next 2 weeks.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {upcomingEvents.map((ev) => (
                  <li key={ev.id}>
                    <Link
                      href="/dashboard/events"
                      className="flex flex-col hover:opacity-80 transition"
                    >
                      <span className="font-medium text-sm leading-snug">{ev.title}</span>
                      <span className="text-xs opacity-50">
                        {formatDate(ev.start_date)}
                        {ev.is_recurring && " · recurring"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── My Next Social Posts ─────────────────────────────────────── */}
        <div className="card bg-base-100 border border-base-200 shadow-sm">
          <div className="card-body p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="card-title text-base">My Next Posts</h2>
              <Link href="/dashboard/posts" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>

            {myPosts.length === 0 ? (
              <p className="text-sm opacity-50 py-4 text-center">
                No upcoming posts assigned to you.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {myPosts.map((post) => (
                    <li key={post.id}>
                      <Link
                        href="/dashboard/posts"
                        className="flex flex-col hover:opacity-80 transition"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">{post.title}</span>
                          <span className={`badge badge-xs shrink-0 ${STATUS_BADGE[post.status] ?? "badge-ghost"}`}>
                            {post.status}
                          </span>
                        </div>
                        <span className="text-xs opacity-50">{post.post_type}</span>
                        {post.scheduled_at && (
                          <span className="text-xs opacity-40">
                            {post.scheduled_at.split("T")[0]} · {post.time_slot ?? ""}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Community Feedback ──────────────────────────────────────── */}
        <div className="card bg-base-100 border border-base-200 shadow-sm">
          <div className="card-body p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="card-title text-base">Community Feedback</h2>
              <Link href="/dashboard/community-feedback" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>

            {recentFeedback.length === 0 ? (
              <p className="text-sm opacity-50 py-4 text-center">No feedback yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {recentFeedback.map((fb) => (
                  <li key={fb.id} className="flex flex-col">
                    <span className="font-medium text-sm">{fb.name}</span>
                    <span className="text-xs opacity-70 line-clamp-2">{fb.message}</span>
                    <span className="text-xs opacity-40">
                      {formatDateTime(fb.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
