"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Notification } from "@/app/schemas/notifications";
import {
  fetchUnreadCount,
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
  return `${Math.floor(h / 24)}d ago`;
}

function notificationHref(n: Notification): string {
  if (n.entity_type === "scheduled_post") {
    return `/dashboard/events`;
  }
  return `/dashboard/notifications`;
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Notification[] | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poll = () => {
      fetchUnreadCount({}).then((res) => {
        if (res?.data) setUnread(res.data.count);
      });
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!open || preview !== null) return;
    fetchNotifications({}).then((res) => {
      if (res?.data) {
        setPreview(res.data.notifications.slice(0, 5));
        setUnread(res.data.unreadCount);
      } else {
        setPreview([]);
      }
    });
  }, [open, preview]);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadingPreview = open && preview === null;

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) setPreview(null);
  };

  const handleRead = async (n: Notification) => {
    if (!n.read_at) {
      await markNotificationRead({ id: n.id });
      setPreview((prev) =>
        (prev ?? []).map((p) => (p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p)),
      );
      setUnread((v) => Math.max(0, v - 1));
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead({});
    setPreview((prev) => (prev ?? []).map((p) => ({ ...p, read_at: new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        className="btn btn-ghost btn-circle relative"
        onClick={handleOpen}
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 bg-error text-white text-xs rounded-full min-w-4 h-4 flex items-center justify-center px-1 leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-base-100 border border-base-200 rounded-box shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-2 border-b border-base-200">
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && (
              <button
                className="text-xs text-primary hover:underline"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <ul className="divide-y divide-base-200 max-h-80 overflow-y-auto">
            {loadingPreview ? (
              <li className="flex justify-center py-6">
                <span className="loading loading-spinner loading-sm" />
              </li>
            ) : (preview ?? []).length === 0 ? (
              <li className="text-center text-sm opacity-50 py-6">No notifications</li>
            ) : (
              (preview ?? []).map((n) => (
                <li key={n.id}>
                  <Link
                    href={notificationHref(n)}
                    className={`flex flex-col gap-0.5 px-4 py-3 hover:bg-base-200 transition ${
                      !n.read_at ? "bg-primary/5" : ""
                    }`}
                    onClick={() => { handleRead(n); setOpen(false); }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm ${!n.read_at ? "font-semibold" : ""}`}>
                        {n.title}
                      </span>
                      {!n.read_at && (
                        <span className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <span className="text-xs opacity-60 line-clamp-2">{n.body}</span>
                    <span className="text-xs opacity-40">{timeAgo(n.created_at)}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>

          <div className="border-t border-base-200 px-4 py-2 text-center">
            <Link
              href="/dashboard/notifications"
              className="text-xs text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              Show all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
