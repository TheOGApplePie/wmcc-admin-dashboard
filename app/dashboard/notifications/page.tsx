"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Notification } from "@/app/schemas/notifications";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/actions/notifications";
import { PageShell } from "@/app/components/ui/PageShell";
import { Badge } from "@/app/components/ui/Badge";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(dateStr).toLocaleDateString();
}

const TYPE_META: Record<string, { label: string; variant: "amber" | "violet" | "teal" | "muted" }> = {
  post_overdue:  { label: "Overdue Post", variant: "amber"  },
  post_assigned: { label: "Assignment",   variant: "violet" },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(true);
  const [markingAll, setMarkingAll]       = useState(false);

  useEffect(() => {
    fetchNotifications({}).then((res) => {
      setNotifications(res?.data?.notifications ?? []);
      setLoading(false);
    });
  }, []);

  const handleRead = async (n: Notification) => {
    if (n.read_at) return;
    await markNotificationRead({ id: n.id });
    setNotifications((prev) =>
      prev.map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)),
    );
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    await markAllNotificationsRead({});
    setNotifications((prev) =>
      prev.map((p) => ({ ...p, read_at: p.read_at ?? new Date().toISOString() })),
    );
    setMarkingAll(false);
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAllAction: React.ReactNode = unreadCount > 0 ? (
    <button
      className="px-3 py-1.5 text-[12px] font-semibold rounded-xl border border-line hover:border-teal hover:text-teal transition-colors disabled:opacity-50"
      disabled={markingAll}
      onClick={handleMarkAllRead}
    >
      {markingAll && <span className="loading loading-spinner loading-xs mr-1.5" />}
      Mark all read
    </button>
  ) : undefined;

  const subtitle = unreadCount > 0 ? `${unreadCount} unread` : undefined;

  function renderBody() {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24">
          <span className="loading loading-spinner loading-lg" />
        </div>
      );
    }
    if (notifications.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 opacity-40 gap-3">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          <p className="text-[14px]">No notifications yet.</p>
        </div>
      );
    }
    return (
      <ul className="flex flex-col gap-2">
        {notifications.map((n) => {
              const meta = TYPE_META[n.type] ?? { label: n.type, variant: "muted" as const };
              return (
                <li
                  key={n.id}
                  className={`bg-surface border rounded-2xl p-4 flex gap-4 items-start transition-colors ${
                    n.read_at ? "border-line" : "border-teal/30 bg-teal-soft/20"
                  }`}
                >
                  <div className="mt-1 shrink-0">
                    <span
                      className="block w-2 h-2 rounded-full"
                      style={{ backgroundColor: n.read_at ? "#E7E3DA" : "#0F8073" }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-[13px] font-semibold">{n.title}</p>
                    <p className="text-[12px] text-muted mt-0.5">{n.body}</p>
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    {n.entity_type === "scheduled_post" && (
                      <Link
                        href="/dashboard/posts"
                        className="text-[12px] text-teal hover:text-teal-dark transition-colors font-medium"
                        onClick={() => handleRead(n)}
                      >
                        View →
                      </Link>
                    )}
                    {!n.read_at && (
                      <button
                        className="text-[11px] text-muted hover:text-ink transition-colors"
                        onClick={() => handleRead(n)}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
    );
  }

  return (
    <PageShell
      title="Notifications"
      subtitle={subtitle}
      actions={markAllAction}
    >
      <div className="max-w-3xl mx-auto">
        {renderBody()}
      </div>
    </PageShell>
  );
}
