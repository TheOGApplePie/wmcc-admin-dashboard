"use client";
import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { fetchRecentUnread } from "@/actions/notifications";

// Runs once on mount after login. Fetches unread notifications from the last
// 24 hours and shows a concise summary toast.
export default function NotificationInit() {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    fetchRecentUnread({}).then((res) => {
      const notifications = res?.data?.notifications ?? [];
      if (notifications.length === 0) return;

      const overdue = notifications.filter((n) => n.type === "post_overdue");
      const assigned = notifications.filter((n) => n.type === "post_assigned");

      if (overdue.length > 0) {
        toast(
          overdue.length === 1
            ? "You have 1 overdue post that needs to be marked as sent."
            : `You have ${overdue.length} overdue posts that need to be marked as sent.`,
          { icon: "⚠️", duration: 6000 },
        );
      }

      for (const n of assigned) {
        toast(n.body, { icon: "📌", duration: 5000 });
      }
    });
  }, []);

  return null;
}
