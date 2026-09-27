import { DASHBOARD_LOOKAHEAD_DAYS, DASHBOARD_POST_LIMIT, DASHBOARD_FEEDBACK_LIMIT } from "./_lib/dashboard";
import { readOccurrences } from "@/features/events/server";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { PageShell } from "@/app/components/ui/PageShell";
import { Card, CardHead } from "@/app/components/ui/Card";
import { Stat } from "@/app/components/ui/Stat";
import { Badge } from "@/app/components/ui/Badge";
import { Avatar } from "@/app/components/ui/Avatar";
import { toEstDay, type Occurrence } from "@/utils/expandEvents";
import { getViewerAccess } from "@/features/access/server";
import { EventsCard } from "./EventsCard";
import { POST_BADGE, DASHBOARD_EVENT_LIMIT } from "./_lib/dashboard";
import { formatTorontoDateTime as fmtDateTime } from "@/app/utils/date";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Dashboard() {
  const supabase = await createClient();
  const access = await getViewerAccess();
  const canViewEvents = access.permissions["events.view"] ?? false;
  const canViewSocial = access.permissions["social.view"] ?? false;
  const canViewFeedback = access.permissions["feedback.view"] ?? false;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const [eventRows, myPostsRes, feedbackRes, feedbackCountRes] =
    await Promise.all([
      canViewEvents
        ? readOccurrences(
            supabase,
            now.toISOString(),
            new Date(now.getTime() + DASHBOARD_LOOKAHEAD_DAYS * DAY_MS).toISOString(),
          )
        : Promise.resolve([]),
      user?.id && canViewSocial
        ? supabase
            .from("social_posts")
            .select(
              "id, title, post_type, time_slot, scheduled_at, status, channels",
            )
            .eq("assigned_to", user.id)
            .in("status", ["draft", "scheduled"])
            .gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at")
            .limit(DASHBOARD_POST_LIMIT)
        : Promise.resolve({ data: [] }),
      canViewFeedback
        ? supabase
            .from("community-feedback")
            .select("id, name, message, created_at")
            .order("created_at", { ascending: false })
            .limit(DASHBOARD_FEEDBACK_LIMIT)
        : Promise.resolve({ data: [] }),
      canViewFeedback
        ? supabase
            .from("community-feedback")
            .select("id", { count: "exact", head: true })
        : Promise.resolve({ count: 0 }),
    ]);

  const occurrences: Occurrence[] = eventRows.map((row) => ({
    event: {
      ...row,
      id: row.event_id,
      occurrence_id: row.id,
      start_date: row.start_at,
      end_date: row.end_at,
      is_recurring: false,
      poster_file: null,
      action: "single",
      call_to_action_caption: row.call_to_action_caption ?? "",
    },
    occurrenceDate: toEstDay(row.start_at),
  }));

  const upcomingOccs = occurrences.slice(0, DASHBOARD_EVENT_LIMIT);
  const myPosts = myPostsRes.data ?? [];
  const recentFeedback = feedbackRes.data ?? [];
  const eventCount = occurrences.length;
  const feedbackCount = feedbackCountRes.count ?? 0;
  const postCount = myPosts.length;

  const dateLabel = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <PageShell title="Dashboard" subtitle={dateLabel}>
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {canViewEvents && (
          <Stat
            label="Upcoming Sessions"
            value={eventCount}
          />
        )}
        {canViewFeedback && (
          <Stat
            label="Community Feedback"
            value={feedbackCount}
          />
        )}
        {canViewSocial && (
          <Stat
            label="My Queued Posts"
            value={postCount}
          />
        )}
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* ── Event spotlight ───────────────────────────────────────────── */}
        {canViewEvents && (
          <div className="lg:col-span-2">
            <EventsCard occs={upcomingOccs} />
          </div>
        )}

        {/* ── Community feedback ────────────────────────────────────────── */}
        {canViewFeedback && (
          <Card>
            <CardHead
              title="Community Feedback"
              action={
                <Link
                  href="/dashboard/community-feedback"
                  className="text-xs text-teal hover:text-teal-dark transition-colors"
                >
                  View all
                </Link>
              }
            />
            {recentFeedback.length === 0 ? (
              <p className="text-body-sm text-muted py-4 text-center">
                No feedback yet.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {recentFeedback.map((fb) => (
                  <li key={fb.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={fb.name} size={28} className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-snug">
                          {fb.name}
                        </p>
                        <p className="text-xs text-muted line-clamp-2 mt-0.5">
                          {fb.message}
                        </p>
                        <p className="text-micro text-muted opacity-60 mt-0.5">
                          {fmtDateTime(fb.created_at)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* ── My queued posts ───────────────────────────────────────────── */}
        {canViewSocial && (
          <div className="md:col-span-2 lg:col-span-3">
            <Card>
              <CardHead
                title="My Next Posts"
                subtitle={
                  user ? "Assigned to you" : "Sign in to see your posts"
                }
                action={
                  <Link
                    href="/dashboard/posts"
                    className="text-xs text-teal hover:text-teal-dark transition-colors"
                  >
                    View all
                  </Link>
                }
              />
              {myPosts.length === 0 ? (
                <p className="text-body-sm text-muted py-4 text-center">
                  No upcoming posts assigned to you.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {myPosts.map((post) => {
                    const badge = POST_BADGE[post.status] ?? POST_BADGE.draft;
                    return (
                      <Link
                        key={post.id}
                        href="/dashboard/posts"
                        className="group flex flex-col gap-1.5 rounded-xl border border-line p-3 transition-colors hover:border-teal/30 hover:bg-teal-soft/30"
                      >
                        <div className="flex items-center gap-1.5">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <span className="text-micro text-muted uppercase tracking-wide font-medium">
                            {post.post_type}
                          </span>
                        </div>
                        <p className="text-body-sm font-semibold leading-snug line-clamp-2 group-hover:text-teal-dark transition-colors">
                          {post.title}
                        </p>
                        {post.scheduled_at && (
                          <p className="text-caption text-muted mt-auto">
                            {post.scheduled_at.split("T")[0]}
                            {post.time_slot ? ` · ${post.time_slot}` : ""}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </PageShell>
  );
}
