"use server";

import { createSafeActionClient } from "next-safe-action";
import { revalidatePath } from "next/cache";
import {
  CampaignIdZod,
  CampaignLifecycleZod,
  CreateCampaignZod,
  CreateManualSocialPostZod,
  DeleteSocialDeliveryZod,
  GenerateCampaignProposalZod,
  ReviewVerdictZod,
  UpdateSocialDeliveryZod,
  UpdateCampaignZod,
  type CampaignEventOption,
  type AdminUserOption,
  type SocialCalendarDelivery,
  type SocialCampaign,
  type SocialCampaignReview,
} from "@/app/schemas/socialCampaigns";
import { clientFail, fail, ok } from "@/utils/actionResponse";
import { logAudit } from "@/utils/audit";
import { requirePermission } from "@/utils/permissions";
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { formatInTimeZone } from "date-fns-tz";
import {
  SOCIAL_TIME_ZONE,
  addCalendarDays,
  expandCampaignOccurrences,
  nextCampaignOccurrence,
  planProposalSlots,
  proposeEventSchedule,
  schedulePlatformFor,
  scheduledAtFor,
  type CampaignRecurrenceRule,
  type OccupiedSlot,
  type ScheduleProposal,
  type SocialChannel,
  type SocialTimeSlot,
} from "@/features/socialCampaigns/scheduling";

const actionClient = createSafeActionClient();
const REVALIDATE = "/dashboard/posts";
const SELECT = "*, events(title, start_date, is_recurring)";

type GenerationEvent = {
  id: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  poster_url: string | null;
  call_to_action_link: string | null;
  call_to_action_caption: string | null;
  is_recurring: boolean;
  recurrence_rule: CampaignRecurrenceRule | CampaignRecurrenceRule[] | null;
};

type PersistedProposal = ScheduleProposal & {
  sequence: number;
  title: string;
  caption: string;
  description: string;
  mediaUrl: string | null;
  callToActionLink: string | null;
  callToActionCaption: string | null;
  suggestions: Partial<Record<SocialChannel, { date: string; slot: SocialTimeSlot }>>;
};

type SocialMediaItemInput = { url: string; alt_text: string };

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

async function assertSocialMediaSelection(
  channel: SocialChannel,
  mediaItems: SocialMediaItemInput[],
) {
  if (!mediaItems.length) return;
  const service = createServiceClient();
  const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;

  for (const item of mediaItems) {
    const url = new URL(item.url);
    if (url.origin !== storageOrigin) throw new Error("Social media must come from this project's Supabase Storage.");
    const match = url.pathname.match(/^\/storage\/v1\/object\/public\/(event-posters|videos)\/(.+)$/);
    if (!match) throw new Error("Select media from the event-posters or videos bucket.");
    const bucket = match[1] as "event-posters" | "videos";
    const path = decodeURIComponent(match[2]);
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const { data, error } = await service.storage.from(bucket).list(folder, { limit: 100, search: name });
    if (error) throw new Error(`Unable to verify selected media: ${error.message}`);
    const object = data?.find((entry) => entry.name === name && entry.id !== null);
    if (!object) throw new Error("A selected media object no longer exists in Storage.");
    const mimeType = String(object.metadata?.mimetype ?? "").toLowerCase();
    const requiresVideo = channel === "instagram_reel" || channel === "tiktok_reel";
    const requiresImage = channel === "instagram_feed" || channel === "instagram_story";
    const allowedVideo = channel === "instagram_reel"
      ? new Set(["video/mp4", "video/quicktime"]).has(mimeType)
      : VIDEO_MIME_TYPES.has(mimeType);
    if (requiresVideo && (bucket !== "videos" || !allowedVideo)) {
      throw new Error(channel === "instagram_reel"
        ? "Instagram Reel requires an MP4 or MOV video from the videos bucket."
        : "TikTok requires an MP4, MOV, or WebM video from the videos bucket.");
    }
    if (requiresImage && (bucket !== "event-posters" || mimeType !== "image/jpeg")) {
      throw new Error("Instagram image publishing requires a JPEG from the event-posters bucket.");
    }
    if (channel === "whatsapp" && !IMAGE_MIME_TYPES.has(mimeType) && !VIDEO_MIME_TYPES.has(mimeType)) {
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
    .select(`
      id, title, start_date, end_date, is_recurring, recurrence_rule_id,
      recurrence_rule(frequency, interval, by_weekdays, by_month_day, by_set_position, until, count, exdates)
    `)
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
    return fail(error instanceof Error ? error.message : String(error), "Failed to load campaigns.");
  }
});

export const getSocialCalendarDeliveries = actionClient.action(async () => {
  try {
    const { supabase } = await requirePermission("social", "view");
    const { data, error } = await supabase
      .from("social_deliveries")
      .select(`
        id, schedule_platform, scheduled_date, time_slot, scheduled_at, status, attempt_count, retryable, next_attempt_at, provider_error,
        social_post_variants!inner(
          id, channel, caption, description, media_url, media_items, hashtags, call_to_action_link, call_to_action_caption,
          social_posts!inner(
            id, title, description, media_url, campaign_id,
            social_campaigns!inner(id, name, status)
          )
        )
      `)
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: true });
    if (error) throw new Error(error.message);

    const one = <T>(value: T | T[]): T => Array.isArray(value) ? value[0] : value;
    const deliveries = (data ?? []).map((row) => {
      const variant = one(row.social_post_variants);
      const post = one(variant.social_posts);
      const campaign = one(post.social_campaigns);
      return {
        id: row.id,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        post_id: post.id,
        variant_id: variant.id,
        post_title: post.title,
        caption: variant.caption,
        description: variant.description || post.description,
        media_url: variant.media_url || post.media_url,
        media_items: variant.media_items?.length ? variant.media_items : (variant.media_url || post.media_url ? [{ url: variant.media_url || post.media_url, alt_text: "" }] : []),
        hashtags: variant.hashtags ?? [],
        call_to_action_link: variant.call_to_action_link,
        call_to_action_caption: variant.call_to_action_caption,
        channel: variant.channel,
        schedule_platform: row.schedule_platform,
        scheduled_date: row.scheduled_date,
        time_slot: row.time_slot,
        scheduled_at: row.scheduled_at,
        status: row.status,
        attempt_count: row.attempt_count,
        retryable: row.retryable,
        next_attempt_at: row.next_attempt_at,
        provider_error: row.provider_error,
      };
    }) as SocialCalendarDelivery[];

    return ok(deliveries);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), "Failed to load the social calendar.");
  }
});

export const updateSocialDelivery = actionClient
  .inputSchema(UpdateSocialDeliveryZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");

      const { data: existing, error: existingError } = await supabase
        .from("social_deliveries")
        .select("status, scheduled_date, time_slot")
        .eq("id", parsedInput.id)
        .single();
      if (existingError) throw new Error(existingError.message);
      if (["due", "processing", "sent", "skipped"].includes(existing.status)) {
        return clientFail("This delivery can no longer be edited.");
      }
      const scheduleChanged = existing.status !== parsedInput.status ||
        (parsedInput.status !== "draft" && (
          existing.scheduled_date !== parsedInput.scheduled_date ||
          existing.time_slot !== parsedInput.time_slot
        ));
      if (scheduleChanged || parsedInput.status === "scheduled") {
        await requirePermission("social", "schedule");
      }

      const schedulePlatform = schedulePlatformFor(parsedInput.channel);
      if (["proposed", "scheduled", "failed"].includes(parsedInput.status) && parsedInput.scheduled_date && parsedInput.time_slot) {
        const { data: collision, error: collisionError } = await supabase
          .from("social_deliveries")
          .select("id, status, retryable")
          .eq("schedule_platform", schedulePlatform)
          .eq("scheduled_date", parsedInput.scheduled_date)
          .eq("time_slot", parsedInput.time_slot)
          .neq("id", parsedInput.id)
          .in("status", ["proposed", "scheduled", "due", "processing", "failed"]);
        if (collisionError) throw new Error(collisionError.message);
        if (collision?.some((item) => item.status !== "failed" || item.retryable)) {
          return clientFail("That platform and time slot is already occupied.");
        }
      }

      const scheduledAt = ["scheduled", "sent", "failed"].includes(parsedInput.status) && parsedInput.scheduled_date && parsedInput.time_slot
        ? scheduledAtFor(parsedInput.scheduled_date, parsedInput.time_slot)
        : null;
      if (parsedInput.status === "scheduled" && scheduledAt && Date.parse(scheduledAt) <= Date.now()) {
        return clientFail("Choose a future time slot before scheduling.");
      }
      if (parsedInput.status === "scheduled") {
        await assertSocialMediaSelection(parsedInput.channel, parsedInput.media_items);
      }
      const { error: updateError } = await supabase.rpc("update_social_delivery_post", {
        p_delivery_id: parsedInput.id,
        p_title: parsedInput.title,
        p_description: parsedInput.description,
        p_caption: parsedInput.caption,
        p_media_url: parsedInput.media_url,
        p_media_items: parsedInput.media_items,
        p_hashtags: parsedInput.hashtags,
        p_call_to_action_link: parsedInput.call_to_action_link,
        p_call_to_action_caption: parsedInput.call_to_action_caption,
        p_channel: parsedInput.channel,
        p_mode: parsedInput.status,
        p_scheduled_date: parsedInput.status === "scheduled" ? parsedInput.scheduled_date : null,
        p_time_slot: parsedInput.status === "scheduled" ? parsedInput.time_slot : null,
      });
      if (updateError) throw new Error(updateError.message);

      await logAudit(supabase, "social_delivery", parsedInput.id, "update", `${schedulePlatform}:${parsedInput.scheduled_date}:${parsedInput.time_slot}`);
      revalidatePath(REVALIDATE);
      return ok({ ...parsedInput, schedule_platform: schedulePlatform, scheduled_at: scheduledAt }, "Post updated.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to update post.");
    }
  });

export const deleteSocialDelivery = actionClient
  .inputSchema(DeleteSocialDeliveryZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "delete");
      const { error } = await supabase.rpc("delete_social_delivery_post", {
        p_delivery_id: parsedInput.id,
      });
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_delivery", parsedInput.id, "delete", "CMS record only");
      revalidatePath(REVALIDATE);
      return ok({ id: parsedInput.id }, "Post deleted from the CMS.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to delete post.");
    }
  });

export const createManualSocialPost = actionClient
  .inputSchema(CreateManualSocialPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");
      if (parsedInput.mode === "scheduled") await requirePermission("social", "schedule");
      if (parsedInput.mode === "scheduled" && parsedInput.scheduled_date && parsedInput.time_slot) {
        const scheduledAt = scheduledAtFor(parsedInput.scheduled_date, parsedInput.time_slot);
        if (Date.parse(scheduledAt) <= Date.now()) return clientFail("Choose a future time slot before scheduling.");
      }
      if (parsedInput.mode === "scheduled") {
        await assertSocialMediaSelection(parsedInput.variants[0].channel, parsedInput.variants[0].media_items);
      }
      const { data, error } = await supabase.rpc("create_manual_social_post", {
        p_campaign_id: parsedInput.campaign_id,
        p_title: parsedInput.title,
        p_description: parsedInput.description,
        p_scheduled_date: parsedInput.scheduled_date,
        p_time_slot: parsedInput.time_slot,
        p_mode: parsedInput.mode,
        p_variants: parsedInput.variants,
      });
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_post", String(data), "create", `manual:${parsedInput.mode}`);
      revalidatePath(REVALIDATE);
      return ok({ id: String(data) }, parsedInput.mode === "scheduled" ? "Post scheduled." : "Draft saved.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to create post.");
    }
  });

export const getSocialCampaign = actionClient
  .inputSchema(CampaignIdZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "view");
      const { data, error } = await supabase
        .from("social_campaigns")
        .select(`${SELECT}, social_campaign_reviews(*, social_post_review_items(*))`)
        .eq("id", parsedInput.id)
        .single();
      if (error) throw new Error(error.message);
      return ok(data as SocialCampaign & { social_campaign_reviews: SocialCampaignReview[] });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to load campaign.");
    }
  });

export const resolveCampaignReview = actionClient
  .inputSchema(ReviewVerdictZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "review");
      const { error } = await supabase.rpc("resolve_social_campaign_review", {
        p_review_id: parsedInput.review_id,
        p_decision: parsedInput.decision,
        p_post_id: parsedInput.post_id,
      });
      if (error) throw new Error(error.message);
      revalidatePath(REVALIDATE);
      return ok(null, "Review verdict saved.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to save review verdict.");
    }
  });

export const getCampaignEventOptions = actionClient.action(async () => {
  try {
    const { supabase } = await requirePermission("social", "edit");
    const [{ data: events, error: eventsError }, { data: linked, error: linkedError }] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, start_date, end_date, is_recurring, recurrence_rule_id")
        .order("start_date", { ascending: true }),
      supabase.from("social_campaigns").select("id, event_id").not("event_id", "is", null),
    ]);
    if (eventsError) throw new Error(eventsError.message);
    if (linkedError) throw new Error(linkedError.message);
    const campaignByEvent = new Map((linked ?? []).map((row) => [row.event_id, row.id]));
    return ok((events ?? []).map((event) => ({
      ...event,
      campaign_id: campaignByEvent.get(event.id) ?? null,
    })) as CampaignEventOption[]);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), "Failed to load events.");
  }
});

export const getSocialAdminUsers = actionClient.action(async () => {
  try {
    await requirePermission("social", "edit");
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    return ok((data.users ?? [])
      .filter((user): user is typeof user & { email: string } => Boolean(user.email))
      .map((user) => ({ id: user.id, email: user.email })) as AdminUserOption[]);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), "Failed to load users.");
  }
});

export const createSocialCampaign = actionClient
  .inputSchema(CreateCampaignZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase, user } = await requirePermission("social", "edit");
      await assertAssignableUser(parsedInput.default_assigned_to);
      const eventSnapshot = await getEventSnapshot(supabase, parsedInput.event_id);
      const { data, error } = await supabase
        .from("social_campaigns")
        .insert({
          ...parsedInput,
          event_id: parsedInput.event_id ?? null,
          generation_enabled: Boolean(parsedInput.event_id),
          schedule_event_snapshot: eventSnapshot,
          current_event_snapshot: eventSnapshot,
          next_generation_at: parsedInput.event_id ? new Date().toISOString() : null,
          created_by: user.id,
        })
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", data.id, "create", data.name);
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, "Campaign created.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to create campaign.");
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
      if (existing.status !== changes.status) await requirePermission("social", "schedule");
      const eventChanged = existing.event_id !== changes.event_id;
      const eventSnapshot = await getEventSnapshot(supabase, changes.event_id);
      const { data, error } = await supabase
        .from("social_campaigns")
        .update({
          ...changes,
          generation_enabled: Boolean(changes.event_id),
          current_event_snapshot: eventSnapshot,
          ...(eventChanged ? {
            needs_review: true,
            review_reason: "The campaign's linked event changed.",
          } : {}),
        })
        .eq("id", id)
        .neq("status", "archived")
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      if (eventChanged) {
        const service = createServiceClient();
        const { data: openReview, error: reviewLookupError } = await service
          .from("social_campaign_reviews")
          .select("id")
          .eq("campaign_id", id)
          .eq("status", "open")
          .maybeSingle();
        if (reviewLookupError) throw new Error(reviewLookupError.message);
        const reviewValues = {
          reason: "The campaign's linked event changed.",
          schedule_snapshot: existing.schedule_event_snapshot ?? {},
          current_snapshot: eventSnapshot,
          detected_at: new Date().toISOString(),
        };
        const reviewOperation = openReview
          ? service.from("social_campaign_reviews").update(reviewValues).eq("id", openReview.id)
          : service.from("social_campaign_reviews").insert({ campaign_id: id, ...reviewValues });
        const { error: reviewError } = await reviewOperation;
        if (reviewError) throw new Error(reviewError.message);
      }
      await logAudit(supabase, "social_campaign", id, "update", data.name);
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, "Campaign updated.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to update campaign.");
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
      const { supabase } = await requirePermission("social", "schedule");
      const transition = LIFECYCLE_TRANSITIONS[parsedInput.action];
      const { data, error } = await supabase
        .from("social_campaigns")
        .update({ status: transition.to })
        .eq("id", parsedInput.id)
        .in("status", [...transition.from])
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", parsedInput.id, parsedInput.action);
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, `Campaign ${parsedInput.action}d.`);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to change campaign status.");
    }
  });

export const generateCampaignProposal = actionClient
  .inputSchema(GenerateCampaignProposalZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "schedule");
      const { data: campaign, error: campaignError } = await supabase
        .from("social_campaigns")
        .select("*")
        .eq("id", parsedInput.id)
        .single();
      if (campaignError || !campaign) throw new Error(campaignError?.message ?? "Campaign not found.");
      if (campaign.status !== "active") return clientFail("Activate the campaign before generating its schedule.");
      if (campaign.needs_review) return clientFail("Resolve the open campaign review before generating a replacement schedule.");
      if (!campaign.event_id || !campaign.generation_enabled) {
        return clientFail("Standalone campaigns do not generate event proposals.");
      }

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select(`
          id, title, description, start_date, end_date, poster_url,
          call_to_action_link, call_to_action_caption, is_recurring,
          recurrence_rule(frequency, interval, by_weekdays, by_month_day, by_set_position, until, count, exdates)
        `)
        .eq("id", campaign.event_id)
        .single();
      if (eventError || !eventData) throw new Error(eventError?.message ?? "Linked event not found.");
      const event = eventData as unknown as GenerationEvent;
      const rule = Array.isArray(event.recurrence_rule) ? event.recurrence_rule[0] ?? null : event.recurrence_rule;
      if (event.is_recurring && !rule) throw new Error("The linked recurring event has no recurrence rule.");

      const today = formatInTimeZone(new Date(), SOCIAL_TIME_ZONE, "yyyy-MM-dd");
      const coverageStart = campaign.generated_through
        ? addCalendarDays(campaign.generated_through, 1)
        : [today, campaign.starts_on].filter(Boolean).sort().at(-1) as string;
      const coverageEnd = addCalendarDays(coverageStart, campaign.generation_horizon_days - 1);
      const occurrenceThrough = addCalendarDays(coverageEnd, 21);
      let occurrences = expandCampaignOccurrences(event.start_date, rule, today, occurrenceThrough);
      const nextOccurrence = nextCampaignOccurrence(event.start_date, rule, today);
      if (nextOccurrence && !occurrences.includes(nextOccurrence)) occurrences = [nextOccurrence, ...occurrences].sort();

      let launchOccurrenceAt = campaign.launch_occurrence_at as string | null;
      let launchDecisionMade = Boolean(campaign.launch_decision_made);
      if (!launchDecisionMade) {
        if (!nextOccurrence) {
          launchDecisionMade = true;
        } else {
          const isActualFirst = new Date(nextOccurrence).getTime() === new Date(event.start_date).getTime();
          if (isActualFirst || !event.is_recurring) {
            launchOccurrenceAt = nextOccurrence;
            launchDecisionMade = true;
          } else if (!parsedInput.launch_behavior) {
            return clientFail(
              "Choose whether the next occurrence should receive the launch sequence.",
              "Launch decision required.",
            );
          } else {
            launchOccurrenceAt = parsedInput.launch_behavior === "next" ? nextOccurrence : null;
            launchDecisionMade = true;
          }
        }
      }

      const raw = occurrences.flatMap((eventOccurrenceAt) => proposeEventSchedule({
        campaignId: campaign.id,
        campaignCreatedOn: campaign.starts_on ?? formatInTimeZone(campaign.created_at, SOCIAL_TIME_ZONE, "yyyy-MM-dd"),
        eventOccurrenceAt,
        today,
        isFirstOccurrence: launchOccurrenceAt === eventOccurrenceAt,
      })).filter((proposal) => proposal.targetDate >= coverageStart && proposal.targetDate <= coverageEnd);

      const { data: occupiedRows, error: occupiedError } = await supabase
        .from("social_deliveries")
        .select("schedule_platform, scheduled_date, time_slot, status, retryable")
        .in("status", ["proposed", "scheduled", "due", "processing", "failed"])
        .gte("scheduled_date", today)
        .lte("scheduled_date", coverageEnd);
      if (occupiedError) throw new Error(occupiedError.message);
      const occupied: OccupiedSlot[] = (occupiedRows ?? [])
        .filter((row) => row.status !== "failed" || row.retryable)
        .map((row) => ({
          schedulePlatform: row.schedule_platform,
          date: row.scheduled_date,
          slot: row.time_slot,
        })) as OccupiedSlot[];

      const { planned, suppressed } = planProposalSlots(raw, occupied, today);
      const proposals: PersistedProposal[] = planned.map((proposal, sequence) => {
        const label = proposal.kind === "initial" ? "Initial post" : `${proposal.milestoneDays}-day reminder`;
        return {
          ...proposal,
          sequence,
          title: `${label}: ${event.title}`,
          caption: event.description,
          description: event.description,
          mediaUrl: event.poster_url,
          callToActionLink: event.call_to_action_link,
          callToActionCaption: event.call_to_action_caption,
        };
      });

      const { data: inserted, error: persistError } = await supabase.rpc("persist_social_campaign_proposals", {
        p_campaign_id: campaign.id,
        p_proposals: proposals,
        p_suppressed: suppressed,
        p_generated_through: coverageEnd,
        p_launch_occurrence_at: launchOccurrenceAt,
        p_launch_decision_made: launchDecisionMade,
      });
      if (persistError) throw new Error(persistError.message);
      await logAudit(supabase, "social_campaign", campaign.id, "generate", `through:${coverageEnd}; inserted:${inserted ?? 0}`);
      revalidatePath(`${REVALIDATE}/${campaign.id}`);
      revalidatePath(REVALIDATE);
      return ok({ inserted: Number(inserted ?? 0), generated_through: coverageEnd, suppressed: suppressed.length }, "Proposal generated.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to generate proposal.");
    }
  });

export const getCampaignProposals = actionClient
  .inputSchema(CampaignIdZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "view");
      const { data, error } = await supabase
        .from("social_campaign_occurrences")
        .select(`
          *,
          social_posts(
            id, title, caption, status,
            social_post_variants(
              id, channel, caption, media_url,
              social_deliveries(id, schedule_platform, scheduled_date, time_slot, status)
            )
          )
        `)
        .eq("campaign_id", parsedInput.id)
        .neq("proposal_status", "superseded")
        .order("target_date")
        .order("sequence");
      if (error) throw new Error(error.message);
      return ok(data ?? []);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to load proposals.");
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
        : supabase.from("social_campaigns").update({ status: "archived" }).eq("id", parsedInput.id);
      const { error } = await operation;
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", parsedInput.id, permanentlyDelete ? "delete" : "archive");
      revalidatePath(REVALIDATE);
      return ok({ deleted: permanentlyDelete }, permanentlyDelete ? "Empty draft campaign deleted." : "Campaign archived.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to archive campaign.");
    }
  });
