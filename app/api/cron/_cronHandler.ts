import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { TimeSlot } from "@/app/schemas/postScheduling";

// Phase 1: cron does not publish. It finds overdue scheduled posts and creates
// in-app notifications for the assigned admin (or all admins if unassigned).
// Follow-up notifications are rate-limited to once per 48 hours per post.
// Posts older than 1 month are no longer followed up on.

function verifyVercelCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

type OverduePost = {
  id: number;
  event_id: number;
  post_type: string;
  scheduled_date: string;
  time_slot: TimeSlot;
  assigned_to_email: string | null;
};

type AdminUser = {
  id: string;
  email: string;
};

export async function runCronSlot(req: NextRequest, slot: TimeSlot): Promise<NextResponse> {
  if (!verifyVercelCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Find all overdue scheduled posts within the 1-month window that haven't
  // been notified in the last 48 hours.
  const { data: overduePosts, error: fetchError } = await supabase
    .from("scheduled_posts")
    .select("id, event_id, post_type, scheduled_date, time_slot, assigned_to_email")
    .eq("status", "scheduled")
    .lt("scheduled_at", now)
    .gt("scheduled_at", oneMonthAgo)
    .or(`last_notified_at.is.null,last_notified_at.lt.${fortyEightHoursAgo}`);

  if (fetchError) {
    console.error(`[cron/${slot}] fetch error`, fetchError);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const posts = (overduePosts ?? []) as OverduePost[];
  if (posts.length === 0) {
    return NextResponse.json({ slot, notified: 0 });
  }

  // Fetch all admin users once to build an email → id map.
  const { data: authData } = await supabase.auth.admin.listUsers();
  const adminUsers: AdminUser[] = (authData?.users ?? [])
    .filter((u) => !!u.email)
    .map((u) => ({ id: u.id, email: u.email! }));

  const emailToId = new Map(adminUsers.map((u) => [u.email, u.id]));

  let notified = 0;

  for (const post of posts) {
    // Determine which user(s) to notify.
    let recipientIds: string[];

    if (post.assigned_to_email) {
      const uid = emailToId.get(post.assigned_to_email);
      recipientIds = uid ? [uid] : [];
    } else {
      // Unassigned — notify all admins.
      recipientIds = adminUsers.map((u) => u.id);
    }

    if (recipientIds.length === 0) continue;

    const title = "Post overdue";
    const body = `${post.post_type} post scheduled for ${post.scheduled_date} (${post.time_slot}) has not been marked as sent.`;

    const rows = recipientIds.map((userId) => ({
      user_id: userId,
      type: "post_overdue",
      title,
      body,
      entity_type: "scheduled_post",
      entity_id: post.id,
    }));

    await supabase.from("notifications").insert(rows);

    // Stamp last_notified_at to enforce the 48-hour rate limit.
    await supabase
      .from("scheduled_posts")
      .update({ last_notified_at: now })
      .eq("id", post.id);

    notified++;
  }

  return NextResponse.json({ slot, notified });
}
