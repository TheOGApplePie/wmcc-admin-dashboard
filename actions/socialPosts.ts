"use server";

import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../utils/supabase/server";
import { revalidatePath } from "next/cache";
import { ResponseCodes } from "@/app/enums/responseCodes";
import {
  CreateSocialPostZod,
  UpdateSocialPostZod,
  DeleteSocialPostZod,
  ScheduleSocialPostZod,
  PublishSocialPostZod,
  GetSocialPostsZod,
  FetchEventsForSelectZod,
  UploadSocialPostMediaZod,
  SocialPost,
  EventOption,
} from "@/app/schemas/socialPosts";

const actionClient = createSafeActionClient();

const REVALIDATE = "/dashboard/posts";
const STORAGE_BUCKET = "social-media";

type DbRow = Record<string, unknown> & { events?: { title: string } | null };

function toPost(row: unknown): SocialPost {
  const r = row as DbRow;
  return {
    ...(r as unknown as SocialPost),
    event_title: r.events?.title ?? null,
  };
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

      const posts: SocialPost[] = (data ?? []).map(toPost);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "OK",
        data: posts,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to load posts.",
        data: null,
      };
    }
  });

// ─── Fetch upcoming events for the event link select ─────────────────────────

export const fetchEventsForSelect = actionClient
  .inputSchema(FetchEventsForSelectZod)
  .action(async () => {
    try {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("events")
        .select("id, title, start_date")
        .gte("start_date", new Date().toISOString())
        .order("start_date", { ascending: true })
        .limit(100);

      if (error) throw new Error(error.message);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "OK",
        data: (data ?? []) as EventOption[],
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to load events.",
        data: null,
      };
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
          title: parsedInput.title,
          caption: parsedInput.caption,
          channels: parsedInput.channels,
          status: parsedInput.status ?? "draft",
          scheduled_at: parsedInput.scheduled_at ?? null,
          media_url: parsedInput.media_url ?? null,
          event_id: parsedInput.event_id ?? null,
          created_by: user.id,
        })
        .select("*, events(title)")
        .single();

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      const post: SocialPost = toPost(data);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "Post created.",
        data: post,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to create post.",
        data: null,
      };
    }
  });

// ─── Update post ──────────────────────────────────────────────────────────────

export const updateSocialPost = actionClient
  .inputSchema(UpdateSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      // Block updates on published posts
      const { data: existing } = await supabase
        .from("social_posts")
        .select("status")
        .eq("id", parsedInput.id)
        .single();

      if (existing?.status === "published") {
        return {
          error: "Cannot edit a published post.",
          status: ResponseCodes.CLIENT_ERROR,
          statusText: "Post is published.",
          data: null,
        };
      }

      const { data, error } = await supabase
        .from("social_posts")
        .update({
          title: parsedInput.title,
          caption: parsedInput.caption,
          channels: parsedInput.channels,
          status: parsedInput.status,
          scheduled_at: parsedInput.scheduled_at ?? null,
          media_url: parsedInput.media_url ?? null,
          event_id: parsedInput.event_id ?? null,
        })
        .eq("id", parsedInput.id)
        .select("*, events(title)")
        .single();

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      const post: SocialPost = toPost(data);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "Post updated.",
        data: post,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to update post.",
        data: null,
      };
    }
  });

// ─── Delete post ──────────────────────────────────────────────────────────────

export const deleteSocialPost = actionClient
  .inputSchema(DeleteSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      const { error } = await supabase
        .from("social_posts")
        .delete()
        .eq("id", parsedInput.id);

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "Post deleted.",
        data: null,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to delete post.",
        data: null,
      };
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
        return {
          error: "Scheduled time must be in the future.",
          status: ResponseCodes.CLIENT_ERROR,
          statusText: "Past date.",
          data: null,
        };
      }

      // Validate required media for ig_feed / ig_story
      const { data: post } = await supabase
        .from("social_posts")
        .select("channels, media_url")
        .eq("id", parsedInput.id)
        .single();

      const needsMedia = (post?.channels as string[] ?? []).some(
        (c) => c === "ig_feed" || c === "ig_story",
      );
      if (needsMedia && !post?.media_url) {
        return {
          error: "Instagram posts require media. Please upload an image first.",
          status: ResponseCodes.CLIENT_ERROR,
          statusText: "Media required.",
          data: null,
        };
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

      const updated: SocialPost = toPost(data);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "Post scheduled.",
        data: updated,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to schedule post.",
        data: null,
      };
    }
  });

// ─── Publish post (Phase 2 seam) ──────────────────────────────────────────────
// In Phase 2, replace the body of this action with real API calls.
// See INTEGRATIONS.md for the Instagram Graph API and WhatsApp Cloud API details.

export const publishSocialPost = actionClient
  .inputSchema(PublishSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      // Phase 1: mark as published without calling any external API.
      const { data, error } = await supabase
        .from("social_posts")
        .update({ status: "published" })
        .eq("id", parsedInput.id)
        .eq("status", "scheduled")
        .select("*, events(title)")
        .single();

      if (error) throw new Error(error.message);

      revalidatePath(REVALIDATE);

      const updated: SocialPost = toPost(data);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "Post marked as published. (Publishing integration coming soon.)",
        data: updated,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed.",
        data: null,
      };
    }
  });

// ─── Upload media to Supabase Storage ────────────────────────────────────────

export const uploadSocialPostMedia = actionClient
  .inputSchema(UploadSocialPostMediaZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      const file = parsedInput.file;
      const ext = file.name.split(".").pop() ?? "jpg";
      const filename = `${crypto.randomUUID()}.${ext}`;

      const { data: uploaded, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(`public/${filename}`, file, { contentType: file.type });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(uploaded.path);

      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: "Media uploaded.",
        data: { media_url: publicUrl },
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Upload failed.",
        data: null,
      };
    }
  });
