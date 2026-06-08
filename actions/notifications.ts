"use server";
import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import { createClient } from "../utils/supabase/server";
import { Notification } from "@/app/schemas/notifications";

const actionClient = createSafeActionClient();

// ─── Fetch all notifications for the current user (last 1 year) ───────────────

export const fetchNotifications = actionClient
  .inputSchema(z.object({}))
  .action(async () => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { notifications: [], unreadCount: 0, error: "" };

      const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      const notifications = (data ?? []) as Notification[];
      const unreadCount = notifications.filter((n) => !n.read_at).length;
      return { notifications, unreadCount, error: "" };
    } catch (err) {
      return {
        notifications: [] as Notification[],
        unreadCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// ─── Fetch only unread count (for bell badge) ─────────────────────────────────

export const fetchUnreadCount = actionClient
  .inputSchema(z.object({}))
  .action(async () => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { count: 0, error: "" };

      const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null)
        .gte("created_at", since);

      if (error) throw new Error(error.message);
      return { count: count ?? 0, error: "" };
    } catch (err) {
      return { count: 0, error: err instanceof Error ? err.message : String(err) };
    }
  });

// ─── Mark a single notification as read ──────────────────────────────────────

export const markNotificationRead = actionClient
  .inputSchema(z.object({ id: z.coerce.number() }))
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: "Not authenticated." };

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", parsedInput.id)
        .eq("user_id", user.id)
        .is("read_at", null);

      if (error) throw new Error(error.message);
      return { error: "" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

// ─── Mark all notifications as read ──────────────────────────────────────────

export const markAllNotificationsRead = actionClient
  .inputSchema(z.object({}))
  .action(async () => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: "Not authenticated." };

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (error) throw new Error(error.message);
      return { error: "" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

// ─── Fetch recent unread (last 24h) for login toast ──────────────────────────

export const fetchRecentUnread = actionClient
  .inputSchema(z.object({}))
  .action(async () => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { notifications: [] as Notification[], error: "" };

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .is("read_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return { notifications: (data ?? []) as Notification[], error: "" };
    } catch (err) {
      return {
        notifications: [] as Notification[],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
