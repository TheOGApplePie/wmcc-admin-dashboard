import { SocialPost } from "@/app/schemas/socialPosts";
import type { StatCardProps } from "@/features/socialPosts/types";

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end   = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function StatCard({ icon, value, label, iconBg }: Readonly<StatCardProps>) {
  return (
    <div
      className="flex items-center gap-4 rounded-2xl px-5 py-4"
      style={{
        backgroundColor: "var(--sp-surface)",
        boxShadow: "0 8px 30px -12px rgba(20,32,28,.12)",
        flex: 1,
      }}
    >
      <div
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{ width: 44, height: 44, backgroundColor: iconBg }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[22px] font-extrabold leading-none tabular-nums" style={{ color: "var(--sp-ink)" }}>
          {value}
        </div>
        <div className="text-[12px] mt-0.5 font-medium" style={{ color: "var(--sp-muted)" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export default function StatsStrip({ posts }: Readonly<{ posts: SocialPost[] }>) {
  const now           = new Date();
  const weekStart     = startOfWeek(now);
  const weekEnd       = endOfWeek(now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const scheduledThisWeek = posts.filter((p) => {
    if (p.status !== "scheduled" || !p.scheduled_at) return false;
    const d = new Date(p.scheduled_at);
    return d >= weekStart && d <= weekEnd;
  }).length;

  const drafts           = posts.filter((p) => p.status === "draft" || p.status === "idea").length;
  const publishedLast30d = posts.filter(
    (p) => p.status === "published" && new Date(p.updated_at) >= thirtyDaysAgo,
  ).length;

  return (
    <div className="flex gap-4 flex-wrap">
      <StatCard
        iconBg="var(--sp-teal-soft)"
        value={scheduledThisWeek}
        label="Scheduled this week"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sp-teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8"  y1="2" x2="8"  y2="6" />
            <line x1="3"  y1="10" x2="21" y2="10" />
          </svg>
        }
      />
      <StatCard
        iconBg="#FEF3C7"
        value={drafts}
        label="Drafts"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sp-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        }
      />
      <StatCard
        iconBg="#D1FAE5"
        value={publishedLast30d}
        label="Published (30d)"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        }
      />
      <StatCard
        iconBg="#EDE9FE"
        value="—"
        label="Avg. reach / post"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sp-violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4"  />
            <line x1="6"  y1="20" x2="6"  y2="14" />
          </svg>
        }
      />
    </div>
  );
}
