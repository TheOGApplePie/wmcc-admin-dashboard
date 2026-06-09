"use server";

import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../utils/supabase/server";
import { createServiceClient } from "../utils/supabase/serviceRole";
import { revalidatePath } from "next/cache";
import { ok, fail, clientFail } from "@/utils/actionResponse";
import { logAudit } from "@/utils/audit";
import {
  CreateSocialPostZod,
  UpdateSocialPostZod,
  DeleteSocialPostZod,
  ScheduleSocialPostZod,
  PublishSocialPostZod,
  GetSocialPostsZod,
  FetchEventsForSelectZod,
  FetchAdminUsersZod,
  UploadSocialPostMediaZod,
  SocialPost,
  SocialChannel,
  EventOption,
  AdminUserOption,
} from "@/app/schemas/socialPosts";

const actionClient = createSafeActionClient();

const REVALIDATE     = "/dashboard/posts";
const STORAGE_BUCKET = "event-posters";

// Maps the DB row shape (with nested events join) to the SocialPost interface.
type PostDbRow = Omit<SocialPost, "event_title"> & { events: { title: string } | null };

function toPost(row: PostDbRow): SocialPost {
  const { events, ...rest } = row;
  return { ...rest, event_title: events?.title ?? null };
}

// ─── Fetch all posts (with linked event title) ────────────────────────────────

export const getSocialPosts = actionClient
  .inputSchema(GetSocialPostsZod)
  .action(async () => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("social_posts")
        .select("*, events(title)")
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      return ok((data ?? []).map((r) => toPost(r as PostDbRow)));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to load posts.");
    }
  });

// ─── Fetch recent events for the event link select ───────────────────────────

export const fetchEventsForSelect = actionClient
  .inputSchema(FetchEventsForSelectZod)
  .action(async () => {
    try {
      const supabase = await createClient();

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const { data, error } = await supabase
        .from("events")
        .select("id, title, start_date")
        .gte("start_date", threeMonthsAgo.toISOString())
        .order("start_date", { ascending: false })
        .limit(100);

      if (error) throw new Error(error.message);

      return ok((data ?? []) as EventOption[]);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to load events.");
    }
  });

// ─── Create post ──────────────────────────────────────────────────────────────

export const createSocialPost = actionClient
  .inputSchema(CreateSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated.");

      const { data, error } = await supabase
        .from("social_posts")
        .insert({
          title:        parsedInput.title,
          caption:      parsedInput.caption,
          hashtags:     parsedInput.hashtags ?? [],
          channels:     parsedInput.channels,
          post_type:    parsedInput.post_type ?? "GENERAL",
          time_slot:    parsedInput.time_slot ?? null,
          status:       parsedInput.status ?? "draft",
          scheduled_at: parsedInput.scheduled_at ?? null,
          media_url:    parsedInput.media_url ?? null,
          event_id:     parsedInput.event_id ?? null,
          assigned_to:  parsedInput.assigned_to ?? null,
          created_by:   user.id,
        })
        .select("*, events(title)")
        .single();

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      const post = toPost(data as PostDbRow);
      await logAudit(supabase, "social_post", post.id, "create", post.title);

      return ok(post, "Post created.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to create post.");
    }
  });

// ─── Update post ──────────────────────────────────────────────────────────────

export const updateSocialPost = actionClient
  .inputSchema(UpdateSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      const { data: existing } = await supabase
        .from("social_posts")
        .select("status")
        .eq("id", parsedInput.id)
        .single();

      if (existing?.status === "published") {
        return clientFail("Cannot edit a published post.", "Post is published.");
      }

      const { data, error } = await supabase
        .from("social_posts")
        .update({
          title:        parsedInput.title,
          caption:      parsedInput.caption,
          hashtags:     parsedInput.hashtags ?? [],
          channels:     parsedInput.channels,
          post_type:    parsedInput.post_type,
          time_slot:    parsedInput.time_slot ?? null,
          status:       parsedInput.status,
          scheduled_at: parsedInput.scheduled_at ?? null,
          media_url:    parsedInput.media_url ?? null,
          event_id:     parsedInput.event_id ?? null,
          assigned_to:  parsedInput.assigned_to ?? null,
        })
        .eq("id", parsedInput.id)
        .select("*, events(title)")
        .single();

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      const post = toPost(data as PostDbRow);
      await logAudit(supabase, "social_post", post.id, "update", `status:${post.status}`);

      return ok(post, "Post updated.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to update post.");
    }
  });

// ─── Delete post ──────────────────────────────────────────────────────────────

export const deleteSocialPost = actionClient
  .inputSchema(DeleteSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      await logAudit(supabase, "social_post", parsedInput.id, "delete");

      const { error } = await supabase
        .from("social_posts")
        .delete()
        .eq("id", parsedInput.id);

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      return ok(null, "Post deleted.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to delete post.");
    }
  });

// ─── Schedule post ────────────────────────────────────────────────────────────

export const scheduleSocialPost = actionClient
  .inputSchema(ScheduleSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      const scheduledAt = new Date(parsedInput.scheduled_at);
      if (scheduledAt <= new Date()) {
        return clientFail("Scheduled time must be in the future.", "Past date.");
      }

      const { data: post } = await supabase
        .from("social_posts")
        .select("channels, media_url")
        .eq("id", parsedInput.id)
        .single();

      const needsMedia = ((post?.channels as SocialChannel[]) ?? []).some(
        (c) => c === "ig_feed" || c === "ig_story",
      );
      if (needsMedia && !post?.media_url) {
        return clientFail(
          "Instagram posts require media. Please upload an image first.",
          "Media required.",
        );
      }

      const { data, error } = await supabase
        .from("social_posts")
        .update({ status: "scheduled", scheduled_at: parsedInput.scheduled_at })
        .eq("id", parsedInput.id)
        .not("status", "eq", "published")
        .select("*, events(title)")
        .single();

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      const updated = toPost(data as PostDbRow);
      await logAudit(supabase, "social_post", updated.id, "schedule", parsedInput.scheduled_at);

      return ok(updated, "Post scheduled.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to schedule post.");
    }
  });

// ─── Publish post (mark as sent — manual Phase 1 flow) ───────────────────────
// TODO: Phase 2 — replace this action body with real Instagram Graph API and
//       WhatsApp Cloud API calls. See INTEGRATIONS.md for endpoint details.

export const publishSocialPost = actionClient
  .inputSchema(PublishSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("social_posts")
        .update({ status: "published" })
        .eq("id", parsedInput.id)
        .eq("status", "scheduled")
        .select("*, events(title)")
        .single();

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      const updated = toPost(data as PostDbRow);
      await logAudit(supabase, "social_post", updated.id, "publish");

      return ok(updated, "Post marked as sent.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to mark post as sent.");
    }
  });

// ─── Fetch admin users for the assigned_to dropdown ──────────────────────────

export const fetchAdminUsers = actionClient
  .inputSchema(FetchAdminUsersZod)
  .action(async () => {
    try {
      const supabase = createServiceClient();
      const { data: authData } = await supabase.auth.admin.listUsers();
      const users: AdminUserOption[] = (authData?.users ?? [])
        .filter((u): u is typeof u & { email: string } => !!u.email)
        .map((u) => ({ id: u.id, email: u.email }));
      return ok(users);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Failed to load users.");
    }
  });

// ─── Upload media to Supabase Storage ────────────────────────────────────────

export const uploadSocialPostMedia = actionClient
  .inputSchema(UploadSocialPostMediaZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      const file     = parsedInput.file;
      const ext      = file.name.split(".").pop() ?? "jpg";
      const filename = `${crypto.randomUUID()}.${ext}`;

      const { data: uploaded, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(`public/${filename}`, file, { contentType: file.type });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(uploaded.path);

      return ok({ media_url: publicUrl }, "Media uploaded.");
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err), "Upload failed.");
    }
  });
