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
      const overdue = res?.data?.overdueCount ?? 0;
      const assigned = res?.data?.assignments ?? [];
      if (overdue > 0) {
        toast(
          overdue === 1
            ? "You have 1 overdue post that needs to be marked as sent."
            : `You have ${overdue} overdue posts that need to be marked as sent.`,
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
