"use server";

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
  type SocialCalendarPost,
  type SocialCampaign,
} from "@/app/schemas/socialCampaigns";
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

const actionClient = createSafeActionClient();
const REVALIDATE = "/dashboard/posts";
const SELECT =
  "*, events(title, publication_status, event_schedules(id, recurrence_rule_id))";

type SocialMediaItemInput = { url: string; alt_text: string };

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

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
    const allowedVideo =
      channel === "instagram_reel"
        ? new Set(["video/mp4", "video/quicktime"]).has(mimeType)
        : VIDEO_MIME_TYPES.has(mimeType);
    if (requiresVideo && (bucket !== "videos" || !allowedVideo)) {
      throw new Error(
        channel === "instagram_reel"
          ? "Instagram Reel requires an MP4 or MOV video from the videos bucket."
          : "TikTok requires an MP4, MOV, or WebM video from the videos bucket.",
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
    if (
      channel === "whatsapp" &&
      !IMAGE_MIME_TYPES.has(mimeType) &&
      !VIDEO_MIME_TYPES.has(mimeType)
    ) {
      throw new Error("WhatsApp media must be a supported image or video.");
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
    .select("id,title,publication_status,version,event_schedules(*,recurrence_rule(*))")
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

export const getSocialCampaigns = actionClient.action(async () => {
  try {
    const { supabase } = await requirePermission("social", "view");
    const { data, error } = await supabase
      .from("social_campaigns")
      .select(SELECT)
      .order("needs_review", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok((data ?? []) as SocialCampaign[]);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : String(error),
      "Failed to load campaigns.",
    );
  }
});

export const getSocialCalendarPosts = actionClient.action(async () => {
  try {
    const { supabase } = await requirePermission("social", "view");
    const deliveries: SocialCalendarPost[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("social_posts")
        .select("*, social_campaigns!inner(id,name,status)")
        .neq("status", "cancelled").order("id").range(offset, offset + 499);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        deliveries.push({
          ...row,
          campaign_name: row.social_campaigns.name,
          campaign_status: row.social_campaigns.status,
          post_title: row.title,
          media_url: row.media_urls[0] ?? null,
          media_items: row.media_urls.map((url: string, i: number) => ({url, alt_text: row.media_alt_texts[i] ?? ""})),
        } as SocialCalendarPost);
      }
      if (!data || data.length < 500) break;
    }
    return ok(deliveries);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : String(error),
      "Failed to load the social calendar.",
    );
  }
});

export const updateSocialPost = actionClient
  .inputSchema(UpdateSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");

      const { data: existing, error: existingError } = await supabase
        .from("social_posts")
        .select("status, campaign_id, scheduled_date, time_slot")
        .eq("id", parsedInput.id)
        .single();
      if (existingError) throw new Error(existingError.message);
      if (["due", "processing", "provider_processing", "sent", "skipped"].includes(existing.status)) {
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
      const { data: saved, error: updateError } = await supabase.rpc(
        "save_social_post",
        {
          p_id: parsedInput.id,
          p_version: parsedInput.version,
          p_campaign_id: existing.campaign_id,
          p_title: parsedInput.title,
          p_description: parsedInput.description,
          p_caption: parsedInput.caption,
          p_media_urls: parsedInput.media_items.map((item) => item.url),
          p_media_alt_texts: parsedInput.media_items.map((item) => item.alt_text),
          p_hashtags: parsedInput.hashtags,
          p_call_to_action_link: parsedInput.call_to_action_link,
          p_call_to_action_caption: parsedInput.call_to_action_caption,
          p_channel: parsedInput.channel,
          p_mode: parsedInput.status,
          p_scheduled_date: parsedInput.scheduled_date,
          p_time_slot: parsedInput.time_slot,
        },
      ).single<{ id: string; version: number }>();
      if (updateError) throw new Error(updateError.message);

      await logAudit(
        supabase,
        "social_post",
        parsedInput.id,
        "update",
        `${schedulePlatform}:${parsedInput.scheduled_date}:${parsedInput.time_slot}`,
      );
      revalidatePath(REVALIDATE);
      return ok(
        {
          ...parsedInput,
          version: saved.version as number,
          schedule_platform: schedulePlatform,
          scheduled_at: scheduledAt,
        },
        "Post updated.",
      );
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : String(error),
        "Failed to update post.",
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
      const { data, error } = await supabase.rpc("save_social_post", {
        p_id: null, p_version: null, p_campaign_id: post.campaign_id,
        p_title: post.title, p_description: post.description, p_caption: post.caption,
        p_media_urls: post.media_items.map((item) => item.url),
        p_media_alt_texts: post.media_items.map((item) => item.alt_text),
        p_hashtags: post.hashtags, p_call_to_action_link: post.call_to_action_link,
        p_call_to_action_caption: post.call_to_action_caption, p_channel: post.channel,
        p_mode: post.mode, p_scheduled_date: post.scheduled_date, p_time_slot: post.time_slot,
      }).single<{ id: string; version: number }>();
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
        { id: String(data.id) },
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

export const getCampaignEventOptions = actionClient.action(async () => {
  try {
    const { supabase } = await requirePermission("social", "edit");
    const [
      { data: events, error: eventsError },
      { data: linked, error: linkedError },
    ] = await Promise.all([
      supabase
        .from("events")
        .select(
          "id, title, publication_status, event_schedules(id, recurrence_rule_id)",
        )
        .order("title", { ascending: true }),
      supabase
        .from("social_campaigns")
        .select("id, event_id")
        .not("event_id", "is", null),
    ]);
    if (eventsError) throw new Error(eventsError.message);
    if (linkedError) throw new Error(linkedError.message);
    const campaignByEvent = new Map(
      (linked ?? []).map((row) => [row.event_id, row.id]),
    );
    return ok(
      (events ?? []).map((event) => ({
        ...event,
        is_recurring:
          event.event_schedules.length > 1 ||
          event.event_schedules.some((schedule) =>
            Boolean(schedule.recurrence_rule_id),
          ),
        campaign_id: campaignByEvent.get(event.id) ?? null,
      })) as CampaignEventOption[],
    );
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
    const { data, error } = await service.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    return ok(
      (data.users ?? [])
        .filter((user): user is typeof user & { email: string } =>
          Boolean(user.email),
        )
        .map((user) => ({
          id: user.id,
          email: user.email,
        })) as AdminUserOption[],
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : String(error),
      "Failed to load users.",
    );
  }
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
      const { id, ...changes } = parsedInput;
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
        .select(SELECT)
        .single();
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
      );
      if (result.skipped) return clientFail(result.skipped);
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
