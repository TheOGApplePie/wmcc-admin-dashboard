"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Notification } from "@/app/schemas/notifications";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/actions/notifications";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const TYPE_LABEL: Record<string, string> = {
  post_overdue: "Overdue Post",
  post_assigned: "Assignment",
};

const TYPE_COLOR: Record<string, string> = {
  post_overdue: "badge-warning",
  post_assigned: "badge-info",
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetchNotifications({});
    setNotifications(res?.data?.notifications ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
    setNotifications((prev) => prev.map((p) => ({ ...p, read_at: p.read_at ?? new Date().toISOString() })));
    setMarkingAll(false);
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm opacity-60">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            className="btn btn-sm btn-outline"
            disabled={markingAll}
            onClick={handleMarkAllRead}
          >
            {markingAll ? <span className="loading loading-spinner loading-xs" /> : null}
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20 opacity-50">
          <p className="text-lg">No notifications yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`border border-base-200 rounded-xl p-4 flex gap-4 items-start transition ${
                !n.read_at ? "bg-primary/5 border-primary/20" : "bg-base-100"
              }`}
            >
              {/* Unread dot */}
              <div className="mt-1 flex-shrink-0">
                {!n.read_at ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary block" />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full bg-base-300 block" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`badge badge-sm ${TYPE_COLOR[n.type] ?? "badge-ghost"}`}>
                    {TYPE_LABEL[n.type] ?? n.type}
                  </span>
                  <span className="text-xs opacity-40">{timeAgo(n.created_at)}</span>
                </div>
                <p className="font-semibold text-sm">{n.title}</p>
                <p className="text-sm opacity-70 mt-0.5">{n.body}</p>
              </div>

              <div className="flex flex-col gap-1 flex-shrink-0">
                {n.entity_type === "scheduled_post" && (
                  <Link
                    href="/dashboard/events"
                    className="btn btn-xs btn-ghost"
                    onClick={() => handleRead(n)}
                  >
                    View
                  </Link>
                )}
                {!n.read_at && (
                  <button
                    className="btn btn-xs btn-ghost opacity-60"
                    onClick={() => handleRead(n)}
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
