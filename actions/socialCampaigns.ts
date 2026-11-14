"use server";
import { initializePlatformDefaults } from "@/features/socialCampaigns/lib/platformDefaults";

import { z } from "zod";
import {
  CALENDAR_POST_FIELDS,
  calendarPost,
  readCalendarPost,
} from "@/features/socialCampaigns/calendarPosts";
import { SocialPostQuery } from "@/features/socialCampaigns/lib/query";
import { createSafeActionClient } from "next-safe-action";
import { revalidatePath } from "next/cache";
import {
  CampaignIdZod,
  CampaignLifecycleZod,
  CreateCampaignZod,
  CreateManualSocialPostZod,
  DeleteSocialPostZod,
  GenerateCampaignProposalZod,
  ReviewVerdictZod,
  UpdateSocialPostZod,
  UpdateCampaignZod,
  type CampaignEventOption,
  type AdminUserOption,
  type SocialCampaign,
  type SocialCampaignSummary,
} from "@/app/schemas/socialCampaigns";
import { assertInstagramImageUrl } from "@/features/socialCampaigns/instagram/imageValidation";
import { runCampaignGeneration } from "@/features/socialCampaigns/generation/runCampaignGeneration";
import { clientFail, fail, ok } from "@/utils/actionResponse";
import { logAudit } from "@/utils/audit";
import { requirePermission } from "@/utils/permissions";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import {
  schedulePlatformFor,
  scheduledAtFor,
  type SocialChannel,
} from "@/features/socialCampaigns/scheduling";

import {
  ApproveSocialPostsZod,
  BulkSocialPostActionZod,
} from "@/features/socialCampaigns/lib/postApproval";

import { CopyPostDetailsZod } from "@/features/socialCampaigns/lib/copyPostDetails";

const actionClient = createSafeActionClient();
const REVALIDATE = "/dashboard/posts";
const SELECT =
  "*, events(title, publication_status, event_schedules(id, recurrence_rule_id))";

type SocialMediaItemInput = { url: string; alt_text: string };

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4"]);

async function assertSocialMediaSelection(
  channel: SocialChannel,
  mediaItems: SocialMediaItemInput[],
) {
  if (!mediaItems.length) return;
  const service = createServiceClient();
  const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;

  for (const item of mediaItems) {
    const url = new URL(item.url);
    if (url.origin !== storageOrigin)
      throw new Error(
        "Social media must come from this project's Supabase Storage.",
      );
    const match = url.pathname.match(
      /^\/storage\/v1\/object\/public\/(event-posters|videos)\/(.+)$/,
    );
    if (!match)
      throw new Error("Select media from the event-posters or videos bucket.");
    const bucket = match[1] as "event-posters" | "videos";
    const path = decodeURIComponent(match[2]);
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const { data, error } = await service.storage
      .from(bucket)
      .list(folder, { limit: 100, search: name });
    if (error)
      throw new Error(`Unable to verify selected media: ${error.message}`);
    const object = data?.find(
      (entry) => entry.name === name && entry.id !== null,
    );
    if (!object)
      throw new Error("A selected media object no longer exists in Storage.");
    const mimeType = String(object.metadata?.mimetype ?? "").toLowerCase();
    const requiresVideo =
      channel === "instagram_reel" || channel === "tiktok_reel";
    const requiresImage =
      channel === "instagram_feed" || channel === "instagram_story";
    const allowedVideo = VIDEO_MIME_TYPES.has(mimeType);
    if (requiresVideo && (bucket !== "videos" || !allowedVideo)) {
      throw new Error(
        channel === "instagram_reel"
          ? "Instagram Reel requires an MP4 video from the videos bucket."
          : "TikTok requires an MP4 video from the videos bucket.",
      );
    }
    if (
      requiresImage &&
      (bucket !== "event-posters" || mimeType !== "image/jpeg")
    ) {
      throw new Error(
        "Instagram image publishing requires a JPEG from the event-posters bucket.",
      );
    }
    if (requiresImage)
      await assertInstagramImageUrl(item.url, channel === "instagram_feed");
    if (
      channel === "whatsapp" &&
      (bucket !== "event-posters" ||
        !IMAGE_MIME_TYPES.has(mimeType) ||
        !path.startsWith("public/") ||
        path
          .split("/")
          .some((segment) => segment === "." || segment === "..") ||
        !/\.jpe?g$/i.test(path) ||
        url.username ||
        url.password)
    ) {
      throw new Error(
        "WhatsApp supports one JPG/JPEG poster from event-posters/public, or a message without media. Videos are unsupported.",
      );
    }
  }
}

async function getEventSnapshot(
  supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"],
  eventId: number | null | undefined,
) {
  if (!eventId) return {};
  const { data, error } = await supabase
    .from("events")
    .select(
      "id,title,publication_status,version,event_schedules(*,recurrence_rule(*))",
    )
    .eq("id", eventId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function assertAssignableUser(userId: string | null | undefined) {
  if (!userId) return;
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, status")
    .eq("id", userId)
    .single();
  if (error || !data || data.status !== "active") {
    throw new Error("The selected assignee is not an active team member.");
  }
}

export const getSocialCampaigns = actionClient
  .inputSchema(
    z.object({
      status: z
        .enum([
          "all",
          "current",
          "draft",
          "active",
          "paused",
          "completed",
          "archived",
        ])
        .default("current"),
      page: z.number().int().min(1).max(100000).default(1),
    }),
  )
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "view");
      let query = supabase
        .from("social_campaigns")
        .select("id,name,description,status,created_at", { count: "exact" });
      if (parsedInput.status === "current")
        query = query.neq("status", "archived");
      else if (parsedInput.status !== "all")
        query = query.eq("status", parsedInput.status);
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .order("id")
        .range((parsedInput.page - 1) * 30, parsedInput.page * 30 - 1);
      if (error) throw new Error(error.message);
      return {
        ...ok((data ?? []) as SocialCampaignSummary[]),
        total: count ?? 0,
      };
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to load campaigns.",
      );
    }
  });

export const getSocialCalendarPosts = actionClient
  .inputSchema(SocialPostQuery.optional())
  .action(async ({ parsedInput }) => {
    try {
      const input = SocialPostQuery.parse(parsedInput ?? {});
      const { supabase } = await requirePermission("social", "view");
      let query = supabase
        .from("social_posts")
        .select(CALENDAR_POST_FIELDS, { count: "exact" })
        .neq("status", "cancelled");
      if (input.campaignId) query = query.eq("campaign_id", input.campaignId);
      if (input.excludeCampaignId)
        query = query.neq("campaign_id", input.excludeCampaignId);
      if (input.campaignStatus === "current")
        query = query.neq("social_campaigns.status", "archived");
      else if (input.campaignStatus !== "all")
        query = query.eq("social_campaigns.status", input.campaignStatus);
      if (input.platform !== "all")
        query = query.eq("schedule_platform", input.platform);
      if (input.status !== "all") query = query.eq("status", input.status);
      if (input.copySourceId || input.copyTargets) {
        const { data: allowed, error: permissionError } = await supabase.rpc(
          "has_perm",
          { p_module: "social", p_action: "publish" },
        );
        if (permissionError) throw new Error(permissionError.message);
        query = query
          .not("social_campaigns.status", "in", "(archived,completed)");
        if (input.copySourceId) query = query.neq("id", input.copySourceId);
        query = query.is("provider_processing_started_at", null);
        query = allowed
          ? query.or(
              `status.in.(draft,proposed),and(status.eq.failed,retryable.eq.false,next_attempt_at.is.null,external_id.is.null),and(status.eq.scheduled,scheduled_at.gt.${new Date().toISOString()})`,
            )
          : query.or("status.in.(draft,proposed),and(status.eq.failed,retryable.eq.false,next_attempt_at.is.null,external_id.is.null)");
      }
      // Default reads are bounded to the current calendar month, including its grid padding.
      // Campaign-specific lists are separately paginated and include unscheduled drafts.
      if (!input.campaignId && !input.from && !input.through) {
        const now = new Date();
        input.from = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), -6),
        )
          .toISOString()
          .slice(0, 10);
        input.through = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 8),
        )
          .toISOString()
          .slice(0, 10);
      }
      if (input.from) query = query.gte("scheduled_date", input.from);
      if (input.through) query = query.lt("scheduled_date", input.through);
      const { data, error, count } = await query
        .order("scheduled_date", { nullsFirst: false })
        .order("time_slot")
        .order("id")
        .range(
          (input.page - 1) * input.pageSize,
          input.page * input.pageSize - 1,
        );
      if (error) throw new Error(error.message);
      const deliveries = (data ?? []).map((row) =>
        calendarPost(row as unknown as Parameters<typeof calendarPost>[0]),
      );
      return {
        ...ok(deliveries),
        total: count ?? 0,
        hasMore: input.page * input.pageSize < (count ?? 0),
      };
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to load the social calendar.",
      );
    }
  });

export const copySocialPostDetails = actionClient
  .inputSchema(CopyPostDetailsZod)
  .action(async ({ parsedInput: input }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");
      if (input.source_id) {
        const { data: source, error: sourceError } = await supabase
          .from("social_posts")
          .select("id")
          .eq("id", input.source_id)
          .eq("campaign_id", input.campaign_id)
          .single();
        if (sourceError || !source)
          return clientFail("Source post is not in this campaign.");
      }
      const { data: targets, error } = await supabase
        .from("social_posts")
        .select("id,version,title,status,caption,media_urls,media_alt_texts,hashtags,channel,scheduled_date,time_slot,retryable,next_attempt_at,provider_processing_started_at,external_id")
        .eq("campaign_id", input.campaign_id)
        .in(
          "id",
          input.targets.map((target) => target.id),
        );
      if (error) throw new Error(error.message);
      if (targets.length !== input.targets.length)
        return clientFail("Some selected posts are no longer available.");
      if (input.platform && targets.some(target => schedulePlatformFor(target.channel) !== input.platform))
        return clientFail("Select posts belonging to the default's platform.");
      const details = Object.fromEntries(
        input.fields.map((field) => [field, input.details[field]]),
      );
      const verifiedMediaChannels = new Set<string>();
      for (const target of targets) {
        if (!["draft", "proposed", "scheduled", "failed"].includes(target.status) || target.provider_processing_started_at || (target.status === "failed" && (target.retryable || target.next_attempt_at || target.external_id)))
          return clientFail(`"${target.title}" can no longer be edited.`);
        const merged = {
          caption: target.caption,
          media_items: target.media_urls.map((url: string, index: number) => ({
            url,
            alt_text: target.media_alt_texts[index] ?? "",
          })),
          hashtags: target.hashtags,
          ...details,
        };
        const validation = UpdateSocialPostZod.safeParse({
          ...merged,
          id: target.id,
          version: target.version,
          title: target.title,
          channel: target.channel,
          scheduled_date: target.scheduled_date,
          time_slot: target.time_slot,
          status: "draft",
        });
        if (!validation.success)
          return clientFail(
            `"${target.title}": ${validation.error.issues[0].message} No posts were changed.`,
          );
        if (target.status === "scheduled")
          await requirePermission("social", "publish");
        if (
          input.fields.includes("media_items") &&
          !verifiedMediaChannels.has(target.channel)
        ) {
          try {
            await assertSocialMediaSelection(
              target.channel,
              validation.data.media_items,
            );
          } catch (failure) {
            return clientFail(
              `"${target.title}": ${failure instanceof Error ? failure.message : String(failure)} No posts were changed.`,
            );
          }
          verifiedMediaChannels.add(target.channel);
        }
      }
      const { error: copyError } = await supabase.rpc(
        "copy_social_post_details",
        {
          p_source_id: input.source_id ?? null,
          p_campaign_id: input.campaign_id,
          p_targets: input.targets,
          p_details: details,
        },
      );
      if (copyError) throw new Error(copyError.message);
      revalidatePath(REVALIDATE);
      const { data: updated, error: refreshError } = await supabase.from("social_posts").select(CALENDAR_POST_FIELDS).in("id", input.targets.map(target => target.id));
      if (refreshError) return clientFail("Content was copied, but refreshing failed. Reload posts before retrying.");
      return ok((updated ?? []).map(row => calendarPost(row as unknown as Parameters<typeof calendarPost>[0])), "Post details copied. Posts require approval.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  });

export const updateSocialPost = actionClient
  .inputSchema(UpdateSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");

      const { data: existing, error: existingError } = await supabase
        .from("social_posts")
        .select("status, campaign_id, scheduled_date, time_slot,retryable,next_attempt_at,provider_processing_started_at,external_id")
        .eq("id", parsedInput.id)
        .single();
      if (existingError) throw new Error(existingError.message);
      if (existing.provider_processing_started_at || (existing.status === "failed" && (existing.retryable || existing.next_attempt_at || existing.external_id)) ||
        [
          "cancelled",
          "due",
          "processing",
          "provider_processing",
          "sent",
          "skipped",
        ].includes(existing.status)
      ) {
        return clientFail("This post can no longer be edited.");
      }
      if (parsedInput.status === "scheduled") {
        await requirePermission("social", "publish");
      }

      const schedulePlatform = schedulePlatformFor(parsedInput.channel);
      if (
        ["proposed", "scheduled", "failed"].includes(parsedInput.status) &&
        parsedInput.scheduled_date &&
        parsedInput.time_slot
      ) {
        const { data: collision, error: collisionError } = await supabase
          .from("social_posts")
          .select("id, status, retryable")
          .eq("schedule_platform", schedulePlatform)
          .eq("scheduled_date", parsedInput.scheduled_date)
          .eq("time_slot", parsedInput.time_slot)
          .neq("id", parsedInput.id)
          .in("status", [
            "proposed",
            "scheduled",
            "due",
            "processing",
            "provider_processing",
            "failed",
          ]);
        if (collisionError) throw new Error(collisionError.message);
        if (
          collision?.some((item) => item.status !== "failed" || item.retryable)
        ) {
          return clientFail("That platform and time slot is already occupied.");
        }
      }

      const scheduledAt =
        ["scheduled", "sent", "failed"].includes(parsedInput.status) &&
        parsedInput.scheduled_date &&
        parsedInput.time_slot
          ? scheduledAtFor(parsedInput.scheduled_date, parsedInput.time_slot)
          : null;
      if (
        parsedInput.status === "scheduled" &&
        scheduledAt &&
        Date.parse(scheduledAt) <= Date.now()
      ) {
        return clientFail("Choose a future time slot before scheduling.");
      }
      if (parsedInput.status === "scheduled") {
        await assertSocialMediaSelection(
          parsedInput.channel,
          parsedInput.media_items,
        );
      }
      const { data: saved, error: updateError } = await supabase
        .rpc("save_social_post", {
          p_id: parsedInput.id,
          p_version: parsedInput.version,
          p_campaign_id: existing.campaign_id,
          p_title: parsedInput.title,
          p_caption: parsedInput.caption,
          p_media_urls: parsedInput.media_items.map((item) => item.url),
          p_media_alt_texts: parsedInput.media_items.map(
            (item) => item.alt_text,
          ),
          p_hashtags: parsedInput.hashtags,
          p_channel: parsedInput.channel,
          p_mode: parsedInput.status,
          p_scheduled_date: parsedInput.scheduled_date,
          p_time_slot: parsedInput.time_slot,
        })
        .single<{ id: string; version: number }>();
      if (updateError) throw new Error(updateError.message);

      await logAudit(
        supabase,
        "social_post",
        parsedInput.id,
        "update",
        `${schedulePlatform}:${parsedInput.scheduled_date}:${parsedInput.time_slot}`,
      );
      revalidatePath(REVALIDATE);
      return ok(await readCalendarPost(supabase, saved.id), "Post updated.");
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to update post.",
      );
    }
  });

export const approveSocialPosts = actionClient
  .inputSchema(ApproveSocialPostsZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");
      await requirePermission("social", "publish");
      const { data: posts, error } = await supabase
        .from("social_posts")
        .select(
          "id,version,status,title,caption,channel,media_urls,media_alt_texts,hashtags,scheduled_date,time_slot",
        )
        .in(
          "id",
          parsedInput.posts.map((post) => post.id),
        );
      if (error) throw new Error(error.message);
      if (posts.length !== parsedInput.posts.length)
        return clientFail(
          "A selected post is unavailable. Reload before approving.",
        );
      for (const post of posts) {
        const expected = parsedInput.posts.find((item) => item.id === post.id);
        if (
          post.version !== expected?.version ||
          !["draft", "proposed"].includes(post.status)
        )
          return clientFail(
            `"${post.title}" changed. Reload before approving.`,
          );
        const validation = UpdateSocialPostZod.safeParse({
          ...post,
          status: "scheduled",
          media_items: post.media_urls.map((url: string, index: number) => ({
            url,
            alt_text: post.media_alt_texts[index] ?? "",
          })),
        });
        if (!validation.success)
          return clientFail(
            `"${post.title}": ${validation.error.issues[0].message} No posts were approved.`,
          );
        try {
          await assertSocialMediaSelection(
            validation.data.channel,
            validation.data.media_items,
          );
        } catch (failure) {
          return clientFail(
            `"${post.title}": ${failure instanceof Error ? failure.message : String(failure)} No posts were approved.`,
          );
        }
      }
      const { data: count, error: approvalError } = await supabase.rpc(
        "bulk_social_post_action",
        { p_posts: parsedInput.posts, p_action: "approve" },
      );
      if (approvalError) throw new Error(approvalError.message);
      revalidatePath(REVALIDATE, "layout");
      return ok({ count: count as number }, "Selected posts approved.");
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to approve selected posts.",
      );
    }
  });

export const bulkSocialPostAction = actionClient
  .inputSchema(BulkSocialPostActionZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission(
        "social",
        parsedInput.action === "delete" ? "delete" : "edit",
      );
      const { data: count, error } = await supabase.rpc(
        "bulk_social_post_action",
        {
          p_posts: parsedInput.posts,
          p_action: parsedInput.action,
        },
      );
      if (error) throw new Error(error.message);
      revalidatePath(REVALIDATE, "layout");
      return ok({ count: count as number }, "Selected posts updated.");
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to update selected posts.",
      );
    }
  });

export const deleteSocialPost = actionClient
  .inputSchema(DeleteSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "delete");
      const { error } = await supabase.rpc("delete_social_post", {
        p_id: parsedInput.id,
      });
      if (error) throw new Error(error.message);
      await logAudit(
        supabase,
        "social_post",
        parsedInput.id,
        "delete",
        "Removed from calendar; generated identity retained",
      );
      revalidatePath(REVALIDATE);
      return ok({ id: parsedInput.id }, "Post removed from the calendar.");
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to delete post.",
      );
    }
  });

export const createManualSocialPost = actionClient
  .inputSchema(CreateManualSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");
      if (parsedInput.mode === "scheduled")
        await requirePermission("social", "publish");
      if (
        parsedInput.mode === "scheduled" &&
        parsedInput.scheduled_date &&
        parsedInput.time_slot
      ) {
        const scheduledAt = scheduledAtFor(
          parsedInput.scheduled_date,
          parsedInput.time_slot,
        );
        if (Date.parse(scheduledAt) <= Date.now())
          return clientFail("Choose a future time slot before scheduling.");
      }
      if (parsedInput.mode === "scheduled") {
        await assertSocialMediaSelection(
          parsedInput.channel,
          parsedInput.media_items,
        );
      }
      const post = parsedInput;
      const { data, error } = await supabase
        .rpc("save_social_post", {
          p_id: null,
          p_version: null,
          p_campaign_id: post.campaign_id,
          p_title: post.title,
          p_caption: post.caption,
          p_media_urls: post.media_items.map((item) => item.url),
          p_media_alt_texts: post.media_items.map((item) => item.alt_text),
          p_hashtags: post.hashtags,
          p_channel: post.channel,
          p_mode: post.mode,
          p_scheduled_date: post.scheduled_date,
          p_time_slot: post.time_slot,
        })
        .single<{ id: string; version: number }>();
      if (error) throw new Error(error.message);
      await logAudit(
        supabase,
        "social_post",
        String(data.id),
        "create",
        `manual:${parsedInput.mode}`,
      );
      revalidatePath(REVALIDATE);
      return ok(
        await readCalendarPost(supabase, String(data.id)),
        parsedInput.mode === "scheduled" ? "Post scheduled." : "Draft saved.",
      );
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to create post.",
      );
    }
  });

export const getSocialCampaign = actionClient
  .inputSchema(CampaignIdZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "view");
      const { data, error } = await supabase
        .from("social_campaigns")
        .select(SELECT)
        .eq("id", parsedInput.id)
        .single();
      if (error) throw new Error(error.message);
      return ok(data as SocialCampaign);
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to load campaign.",
      );
    }
  });

export const resolveCampaignReview = actionClient
  .inputSchema(ReviewVerdictZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "publish");
      const { error } = await supabase.rpc("acknowledge_social_campaign", {
        p_campaign_id: parsedInput.campaign_id,
        p_version: parsedInput.version,
      });
      if (error) throw new Error(error.message);
      revalidatePath(REVALIDATE);
      return ok(null, "Review verdict saved.");
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to save review verdict.",
      );
    }
  });

export const getCampaignEventOptions = actionClient
  .inputSchema(z.object({ campaignId: z.uuid().optional() }))
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");
      const options: CampaignEventOption[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .rpc("campaign_event_options", {
            p_campaign_id: parsedInput.campaignId ?? null,
          })
          .range(offset, offset + 499);
        if (error) throw new Error(error.message);
        options.push(...((data ?? []) as CampaignEventOption[]));
        if (!data || data.length < 500) break;
      }
      return ok(options);
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to load events.",
      );
    }
  });

export const getSocialAdminUsers = actionClient.action(async () => {
  try {
    await requirePermission("social", "edit");
    const service = createServiceClient();
    const users: AdminUserOption[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await service
        .from("profiles")
        .select("id,email")
        .eq("status", "active")
        .order("email")
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(error.message);
      users.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return ok(users);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : String(error),
      "Failed to load users.",
    );
  }
});

async function readInitialDefaults(supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"], eventId?: number | null) {
  if (!eventId) return initializePlatformDefaults();
  const { data, error } = await supabase.from("events").select("description,poster_url,poster_alt").eq("id", eventId).single();
  if (error) throw new Error(error.message);
  return initializePlatformDefaults(data);
}
export const getInitialCampaignDefaults = actionClient.inputSchema(z.object({ event_id: z.number().int().positive().nullable() }))
  .action(async ({ parsedInput }) => {
    const { supabase } = await requirePermission("social", "edit");
    return readInitialDefaults(supabase, parsedInput.event_id);
  });

export const createSocialCampaign = actionClient
  .inputSchema(CreateCampaignZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase, user } = await requirePermission("social", "edit");
      await assertAssignableUser(parsedInput.default_assigned_to);
      const eventSnapshot = await getEventSnapshot(
        supabase,
        parsedInput.event_id,
      );
      const { data, error } = await supabase
        .from("social_campaigns")
        .insert({
          ...parsedInput,
          platform_defaults: parsedInput.platform_defaults ?? await readInitialDefaults(supabase, parsedInput.event_id),
          event_id: parsedInput.event_id ?? null,
          generation_enabled: Boolean(parsedInput.event_id),
          schedule_event_snapshot: eventSnapshot,
          current_event_snapshot: eventSnapshot,
          next_generation_at: parsedInput.event_id
            ? new Date().toISOString()
            : null,
          created_by: user.id,
        })
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", data.id, "create", data.name);
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, "Campaign created.");
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to create campaign.",
      );
    }
  });

export const updateSocialCampaign = actionClient
  .inputSchema(UpdateCampaignZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");
      await assertAssignableUser(parsedInput.default_assigned_to);
      if (parsedInput.status === "archived") {
        return clientFail("Archive campaigns through the archive action.");
      }
      const { id, version, ...changes } = parsedInput;
      const { data: existing, error: existingError } = await supabase
        .from("social_campaigns")
        .select("event_id, status, schedule_event_snapshot")
        .eq("id", id)
        .single();
      if (existingError) throw new Error(existingError.message);
      if (existing.status !== changes.status)
        await requirePermission("social", "publish");
      const eventChanged = existing.event_id !== changes.event_id;
      const eventSnapshot = await getEventSnapshot(supabase, changes.event_id);
      const { data, error } = await supabase
        .from("social_campaigns")
        .update({
          ...changes,
          generation_enabled: Boolean(changes.event_id),
          current_event_snapshot: eventSnapshot,
          ...(eventChanged
            ? {
                needs_review: true,
                review_reason: "The campaign's linked event changed.",
              }
            : {}),
        })
        .eq("id", id)
        .neq("status", "archived")
        .eq("version", version)
        .select(SELECT)
        .single();
      if (error?.code === "PGRST116") return clientFail("Campaign changed. Reload before saving; your current form edits have been retained.");
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", id, "update", data.name);
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, "Campaign updated.");
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to update campaign.",
      );
    }
  });

const LIFECYCLE_TRANSITIONS = {
  activate: { from: ["draft"], to: "active" },
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
  complete: { from: ["active", "paused"], to: "completed" },
} as const;

export const transitionSocialCampaign = actionClient
  .inputSchema(CampaignLifecycleZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "publish");
      const transition = LIFECYCLE_TRANSITIONS[parsedInput.action];
      const { data, error } = await supabase
        .from("social_campaigns")
        .update({ status: transition.to })
        .eq("id", parsedInput.id)
        .in("status", [...transition.from])
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      await logAudit(
        supabase,
        "social_campaign",
        parsedInput.id,
        parsedInput.action,
      );
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, `Campaign ${parsedInput.action}d.`);
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to change campaign status.",
      );
    }
  });

export const generateCampaignProposal = actionClient
  .inputSchema(GenerateCampaignProposalZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "publish");
      const result = await runCampaignGeneration(
        supabase,
        parsedInput.id,
        parsedInput.launch_behavior,
        { preview: parsedInput.preview },
      );
      if (result.skipped) return clientFail(result.skipped);
      if (parsedInput.preview)
        return ok(
          {
            proposals: result.proposals ?? [],
            generated_through: result.generatedThrough,
            suppressed: result.suppressed,
            inserted: 0,
          },
          "Schedule preview generated. Save to commit it.",
        );
      await logAudit(
        supabase,
        "social_campaign",
        parsedInput.id,
        "generate",
        `through:${result.generatedThrough}; inserted:${result.inserted}`,
      );
      revalidatePath(REVALIDATE);
      return ok(
        {
          proposals: result.proposals ?? [],
          inserted: result.inserted,
          generated_through: result.generatedThrough,
          suppressed: result.suppressed,
        },
        "Proposal generated.",
      );
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to generate proposal.",
      );
    }
  });

export const archiveSocialCampaign = actionClient
  .inputSchema(CampaignIdZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "delete");
      const { data: campaign, error: campaignError } = await supabase
        .from("social_campaigns")
        .select("status")
        .eq("id", parsedInput.id)
        .single();
      if (campaignError) throw new Error(campaignError.message);
      const { count: postCount, error: countError } = await supabase
        .from("social_posts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", parsedInput.id);
      if (countError) throw new Error(countError.message);
      const permanentlyDelete = campaign.status === "draft" && postCount === 0;
      const operation = permanentlyDelete
        ? supabase.from("social_campaigns").delete().eq("id", parsedInput.id)
        : supabase
            .from("social_campaigns")
            .update({ status: "archived" })
            .eq("id", parsedInput.id);
      const { error } = await operation;
      if (error) throw new Error(error.message);
      await logAudit(
        supabase,
        "social_campaign",
        parsedInput.id,
        permanentlyDelete ? "delete" : "archive",
      );
      revalidatePath(REVALIDATE);
      return ok(
        { deleted: permanentlyDelete },
        permanentlyDelete
          ? "Empty draft campaign deleted."
          : "Campaign archived.",
      );
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to archive campaign.",
      );
    }
  });
