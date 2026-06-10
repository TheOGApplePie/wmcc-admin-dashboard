import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { PageShell } from "@/app/components/ui/PageShell";
import { Card, CardHead } from "@/app/components/ui/Card";
import { Stat } from "@/app/components/ui/Stat";
import { Badge } from "@/app/components/ui/Badge";
import { Avatar } from "@/app/components/ui/Avatar";
import { expandEventsToRange, toEstDay, type Occurrence } from "@/utils/expandEvents";
import type { Event } from "@/app/schemas/events";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALSO_THIS_WEEK_DOT_COLORS = ["#7A6CD6", "#0F8073", "#E0A53C", "#E07C5C"] as const;

const DUMMY_VOLUNTEERS = [
  { initials: "AN", bg: "#0F8073" },
  { initials: "OS", bg: "#7A6CD6" },
  { initials: "BR", bg: "#E0A53C" },
] as const;

const VOLUNTEER_OVERFLOW = 5;

const POST_BADGE: Record<string, { label: string; variant: "teal" | "amber" | "coral" | "muted" }> = {
  draft:     { label: "Draft",     variant: "muted" },
  scheduled: { label: "Scheduled", variant: "teal" },
  published: { label: "Published", variant: "teal" },
  failed:    { label: "Failed",    variant: "coral" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(startDate: Date | string): string {
  return new Date(startDate).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  });
}

function fmtDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  });
}

function recurrenceLabel(rule: Event["recurrence_rule"]): string {
  const DAY_NAMES: Record<string, string> = {
    MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
    FR: "Friday", SA: "Saturday", SU: "Sunday",
  };
  if (!rule) return "Recurring";
  if (rule.frequency === "daily") return "Daily";
  if (rule.frequency === "weekly" && rule.by_weekdays?.length) {
    const days = rule.by_weekdays.map((d) => DAY_NAMES[String(d).slice(-2).toUpperCase()] ?? String(d));
    return `Every ${days.join(" & ")}`;
  }
  if (rule.frequency === "monthly") return "Monthly";
  return "Recurring";
}

function occurrenceTimeLabel(event: Event, occurrenceDate: Date): string {
  if (event.is_recurring && event.recurrence_rule) {
    return recurrenceLabel(event.recurrence_rule);
  }
  return occurrenceDate.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventHeroCard({ event, occurrenceDate }: Readonly<{ event: Event; occurrenceDate: Date }>) {
  const dayName = occurrenceDate.toLocaleDateString("en-CA", { weekday: "long", timeZone: "UTC" });
  const timeStr = fmtTime(event.start_date);

  return (
    <div className="relative overflow-hidden rounded-t-2xl" style={{ minHeight: 196 }}>
      {/* Background: poster image or teal gradient fallback */}
      {event.poster_url ? (
        <Image src={event.poster_url} alt={event.title} fill className="object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, #0F8073 0%, #15201C 100%)" }}
        />
      )}

      {/* Gradient overlay for text legibility */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.08) 0%, rgba(0,0,0,.6) 100%)" }}
      />

      {/* Card content */}
      <div className="relative flex flex-col justify-between p-5" style={{ minHeight: 196 }}>
        {/* "Up next" pill */}
        <div>
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full"
            style={{
              backgroundColor: "rgba(246,244,239,.15)",
              backdropFilter: "blur(6px)",
              color: "#F6F4EF",
              border: "1px solid rgba(246,244,239,.25)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#E0A53C" }} />
            Up next · {dayName}
          </span>
        </div>

        {/* Title + meta */}
        <div className="flex flex-col gap-2 mt-3">
          <h3 className="text-white text-[20px] font-bold leading-snug">{event.title}</h3>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1 text-white/80 text-[12px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {timeStr}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 text-white/80 text-[12px]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {event.location}
              </span>
            )}
          </div>

          {/* Volunteer avatars + Manage button */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center">
              {DUMMY_VOLUNTEERS.map((v, i) => (
                <div
                  key={v.initials}
                  className="flex items-center justify-center rounded-full text-white text-[10px] font-bold border-2"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: v.bg,
                    borderColor: "rgba(246,244,239,.5)",
                    marginLeft: i === 0 ? 0 : -8,
                    zIndex: DUMMY_VOLUNTEERS.length - i,
                    position: "relative",
                  }}
                >
                  {v.initials}
                </div>
              ))}
              <div
                className="flex items-center justify-center rounded-full text-white text-[10px] font-semibold border-2"
                style={{
                  width: 28,
                  height: 28,
                  backgroundColor: "rgba(0,0,0,.35)",
                  borderColor: "rgba(246,244,239,.5)",
                  marginLeft: -8,
                  position: "relative",
                  zIndex: 0,
                }}
              >
                +{VOLUNTEER_OVERFLOW}
              </div>
            </div>

            <Link
              href="/dashboard/events"
              className="text-[12px] font-semibold px-4 py-1.5 rounded-xl transition-colors hover:bg-white/20"
              style={{
                backgroundColor: "rgba(246,244,239,.15)",
                backdropFilter: "blur(6px)",
                color: "#F6F4EF",
                border: "1px solid rgba(246,244,239,.25)",
              }}
            >
              Manage event
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlsoThisWeekRow({
  event,
  occurrenceDate,
  dotColor,
}: Readonly<{ event: Event; occurrenceDate: Date; dotColor: string }>) {
  const timeLabel = occurrenceTimeLabel(event, occurrenceDate);
  const timeStr   = fmtTime(event.start_date);

  return (
    <Link
      href="/dashboard/events"
      className="flex items-center gap-3 px-5 py-3 hover:bg-canvas transition-colors group"
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
      <span className="flex-1 text-[13px] font-medium text-ink truncate group-hover:text-teal-dark transition-colors">
        {event.title}
      </span>
      <span className="text-[11px] text-muted shrink-0 hidden sm:inline">
        {timeLabel} · {timeStr}
      </span>
      <svg
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        className="text-muted shrink-0"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

function EventsCard({ occs }: Readonly<{ occs: Occurrence[] }>) {
  if (occs.length === 0) {
    return (
      <Card>
        <CardHead
          title="Upcoming Events"
          action={
            <Link href="/dashboard/events" className="text-[12px] text-teal hover:text-teal-dark transition-colors">
              View calendar
            </Link>
          }
        />
        <p className="text-[13px] text-muted py-4 text-center">No events in the next 2 weeks.</p>
      </Card>
    );
  }

  const [hero, ...rest] = occs;
  const alsoThisWeek = rest.slice(0, 3);

  return (
    <Card noPad className="overflow-hidden">
      <EventHeroCard event={hero.event} occurrenceDate={hero.occurrenceDate} />

      {alsoThisWeek.length > 0 && (
        <>
          <div className="flex items-center justify-between px-5 pt-4 pb-1">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-widest">
              Also this week
            </span>
            <Link
              href="/dashboard/events"
              className="text-[12px] text-teal hover:text-teal-dark transition-colors"
            >
              View calendar
            </Link>
          </div>
          <div className="flex flex-col pb-2">
            {alsoThisWeek.map(({ event, occurrenceDate }, i) => (
              <AlsoThisWeekRow
                key={`${event.id}-${occurrenceDate.toISOString()}`}
                event={event}
                occurrenceDate={occurrenceDate}
                dotColor={ALSO_THIS_WEEK_DOT_COLORS[i % ALSO_THIS_WEEK_DOT_COLORS.length]}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const windowStart = toEstDay(now);
  const windowEnd   = toEstDay(new Date(now.getTime() + 14 * DAY_MS));
  const today       = windowStart.toISOString().split("T")[0];
  // DB prefilter only — start_date is a UTC timestamp, so a 9pm EST event on the
  // last window day is stored as next-day UTC; widen by a day and let
  // expandEventsToRange apply the exact EST-day window.
  const dbWindowEnd = new Date(windowEnd.getTime() + DAY_MS).toISOString().split("T")[0];

  const eventSelect = "id, title, start_date, end_date, location, poster_url, is_recurring, recurrence_rule(*)";

  const [nonRecurringRes, recurringRes, myPostsRes, feedbackRes, feedbackCountRes] =
    await Promise.all([
      supabase
        .from("events")
        .select(eventSelect)
        .eq("is_recurring", false)
        .gte("start_date", today)
        .lte("start_date", dbWindowEnd)
        .overrideTypes<Event[]>(),
      supabase
        .from("events")
        .select(eventSelect)
        .eq("is_recurring", true)
        .overrideTypes<Event[]>(),
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
      supabase
        .from("community-feedback")
        .select("id", { count: "exact", head: true }),
    ]);

  const allEvents = [...(nonRecurringRes.data ?? []), ...(recurringRes.data ?? [])];
  const occurrences = expandEventsToRange(allEvents, windowStart, windowEnd)
    .sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime());

  const upcomingOccs   = occurrences.slice(0, 4);
  const myPosts        = myPostsRes.data ?? [];
  const recentFeedback = feedbackRes.data ?? [];
  const eventCount     = occurrences.length;
  const feedbackCount  = feedbackCountRes.count ?? 0;
  const postCount      = myPosts.length;

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
        <Stat label="Upcoming Events"     value={eventCount}    accentColor="#0F8073" />
        <Stat label="Community Feedback"  value={feedbackCount} accentColor="#7A6CD6" />
        <Stat label="My Queued Posts"     value={postCount}     accentColor="#E0A53C" />
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

        {/* ── Event spotlight ───────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <EventsCard occs={upcomingOccs} />
        </div>

        {/* ── Community feedback ────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Community Feedback"
            action={
              <Link href="/dashboard/community-feedback" className="text-[12px] text-teal hover:text-teal-dark transition-colors">
                View all
              </Link>
            }
          />
          {recentFeedback.length === 0 ? (
            <p className="text-[13px] text-muted py-4 text-center">No feedback yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {recentFeedback.map((fb) => (
                <li key={fb.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-2.5">
                    <Avatar name={fb.name} size={28} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold leading-snug">{fb.name}</p>
                      <p className="text-[12px] text-muted line-clamp-2 mt-0.5">{fb.message}</p>
                      <p className="text-[10px] text-muted opacity-60 mt-0.5">{fmtDateTime(fb.created_at)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── My queued posts ───────────────────────────────────────────── */}
        <div className="md:col-span-2 lg:col-span-3">
          <Card>
            <CardHead
              title="My Next Posts"
              subtitle={user ? "Assigned to you" : "Sign in to see your posts"}
              action={
                <Link href="/dashboard/posts" className="text-[12px] text-teal hover:text-teal-dark transition-colors">
                  View all
                </Link>
              }
            />
            {myPosts.length === 0 ? (
              <p className="text-[13px] text-muted py-4 text-center">No upcoming posts assigned to you.</p>
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
                        <span className="text-[10px] text-muted uppercase tracking-wide font-medium">
                          {post.post_type}
                        </span>
                      </div>
                      <p className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:text-teal-dark transition-colors">
                        {post.title}
                      </p>
                      {post.scheduled_at && (
                        <p className="text-[11px] text-muted mt-auto">
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

      </div>
    </PageShell>
  );
}
