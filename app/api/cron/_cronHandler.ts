import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { SupabaseClient } from "@supabase/supabase-js";

// Finds overdue social_posts and creates in-app notifications for the
// assigned admin (or all admins if unassigned).
// Rate-limited to once per 48 hours per post; ignores posts older than 1 month.

function verifyVercelCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

type AdminUser = { id: string; email: string };

type OverdueSocialPost = {
  id: string;           // UUID
  title: string;
  post_type: string;
  time_slot: string | null;
  scheduled_at: string;
  assigned_to: string | null; // UUID FK → auth.users
};

async function notifySocialPosts(
  supabase: SupabaseClient,
  now: string,
  oneMonthAgo: string,
  fortyEightHoursAgo: string,
  allAdminIds: string[],
): Promise<{ count: number; error?: string }> {
  const { data, error } = await supabase
    .from("social_posts")
    .select("id, title, post_type, time_slot, scheduled_at, assigned_to")
    .eq("status", "scheduled")
    .lt("scheduled_at", now)
    .gt("scheduled_at", oneMonthAgo)
    .or(`last_notified_at.is.null,last_notified_at.lt.${fortyEightHoursAgo}`);

  if (error) return { count: 0, error: error.message };

  let count = 0;
  for (const sp of (data ?? []) as OverdueSocialPost[]) {
    const recipientIds = sp.assigned_to ? [sp.assigned_to] : allAdminIds;
    if (recipientIds.length === 0) continue;

    const dateLabel = sp.scheduled_at.split("T")[0];
    const slotLabel = sp.time_slot ?? "unspecified slot";
    const body = `Social post "${sp.title}" scheduled for ${dateLabel} (${slotLabel}) has not been marked as sent.`;
    await supabase.from("notifications").insert(
      recipientIds.map((userId) => ({
        user_id: userId,
        type: "post_overdue",
        title: "Social post overdue",
        body,
        entity_type: "social_post",
        entity_id: sp.id,
      })),
    );
    await supabase.from("social_posts").update({ last_notified_at: now }).eq("id", sp.id);
    count++;
  }
  return { count };
}

export async function runCronSlot(req: NextRequest, slot: string): Promise<NextResponse> {
  if (!verifyVercelCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: authData } = await supabase.auth.admin.listUsers();
  const adminUsers: AdminUser[] = (authData?.users ?? [])
    .filter((u) => !!u.email)
    .map((u) => ({ id: u.id, email: u.email! }));

  const allAdminIds = adminUsers.map((u) => u.id);

  const { count, error } = await notifySocialPosts(
    supabase, now, oneMonthAgo, fortyEightHoursAgo, allAdminIds,
  );

  if (error) {
    console.error(`[cron/${slot}] social_posts error`, error);
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ slot, notified: count });
}
