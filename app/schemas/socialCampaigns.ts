import { z } from "zod";

export const CampaignStatusZod = z.enum(["draft", "active", "paused", "completed", "archived"]);
export const VariantChannelZod = z.enum([
  "instagram_feed",
  "instagram_story",
  "instagram_reel",
  "whatsapp",
  "tiktok_reel",
]);

const HttpsUrlZod = z.url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS.");
export const SocialMediaItemZod = z.object({
  url: HttpsUrlZod,
  alt_text: z.string().trim().max(1_000),
});

export const CreateCampaignZod = z.object({
  name: z.string().trim().min(1, "Campaign name is required.").max(120),
  description: z.string().trim().max(2_000).default(""),
  event_id: z.coerce.number().int().positive().nullable().optional(),
  starts_on: z.iso.date().nullable().optional(),
  ends_on: z.iso.date().nullable().optional(),
  default_channels: z.array(VariantChannelZod).default([]),
  default_assigned_to: z.uuid().nullable().optional(),
  launch_occurrence_at: z.iso.datetime().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.starts_on && data.ends_on && data.ends_on < data.starts_on) {
    ctx.addIssue({ code: "custom", path: ["ends_on"], message: "End date must be on or after the start date." });
  }
});

export const UpdateCampaignZod = CreateCampaignZod.safeExtend({
  id: z.uuid(),
  status: CampaignStatusZod,
});

export const CampaignIdZod = z.object({ id: z.uuid() });

export const CampaignLifecycleZod = z.object({
  id: z.uuid(),
  action: z.enum(["activate", "pause", "resume", "complete"]),
});

export const GenerateCampaignProposalZod = z.object({
  id: z.uuid(),
  launch_behavior: z.enum(["next", "reminders_only"]).optional(),
});

export const ReviewVerdictZod = z.object({
  review_id: z.uuid(),
  decision: z.enum(["keep_post", "regenerate_post", "keep_all", "regenerate_all"]),
  post_id: z.uuid().nullable().default(null),
}).superRefine((data, ctx) => {
  if (data.decision.endsWith("_post") && !data.post_id) ctx.addIssue({ code: "custom", path: ["post_id"], message: "Select a post." });
});

export const CampaignMediaLinkZod = z.object({
  url: HttpsUrlZod,
});

export const UpdateSocialDeliveryZod = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(120),
  caption: z.string().max(2_200),
  description: z.string().max(2_000),
  media_url: z.union([HttpsUrlZod, z.literal("")]),
  media_items: z.array(SocialMediaItemZod).max(10).default([]),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  call_to_action_link: z.union([HttpsUrlZod, z.literal("")]),
  call_to_action_caption: z.string().max(100).default(""),
  channel: VariantChannelZod,
  scheduled_date: z.iso.date().nullable(),
  time_slot: z.enum(["morning", "afternoon", "evening"]).nullable(),
  status: z.enum(["draft", "scheduled"]),
}).superRefine((data, ctx) => {
  const mediaCount = data.media_items.length || (data.media_url ? 1 : 0);
  if (data.channel !== "instagram_feed" && mediaCount > 1) {
    ctx.addIssue({ code: "custom", path: ["media_items"], message: "Only Instagram Feed supports multiple media links." });
  }
  if (!["draft", "cancelled"].includes(data.status)) {
    if (!data.scheduled_date) ctx.addIssue({ code: "custom", path: ["scheduled_date"], message: "Date is required." });
    if (!data.time_slot) ctx.addIssue({ code: "custom", path: ["time_slot"], message: "Time slot is required." });
    if (data.channel.startsWith("instagram_") && data.channel !== "instagram_reel" && data.media_items.some((item) => !item.alt_text.trim())) {
      ctx.addIssue({ code: "custom", path: ["media_items"], message: "Alt text is required for every Instagram image." });
    }
  }
});

export const DeleteSocialDeliveryZod = z.object({ id: z.uuid() });

export const CreateManualSocialPostZod = z.object({
  campaign_id: z.uuid(),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2_000).default(""),
  scheduled_date: z.iso.date().nullable(),
  time_slot: z.enum(["morning", "afternoon", "evening"]).nullable(),
  mode: z.enum(["draft", "scheduled"]),
  variants: z.array(z.object({
    channel: VariantChannelZod,
    caption: z.string().max(2_200),
    media_url: z.union([HttpsUrlZod, z.literal("")]),
    media_items: z.array(SocialMediaItemZod).max(10).default([]),
    hashtags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    call_to_action_link: z.union([HttpsUrlZod, z.literal("")]),
    call_to_action_caption: z.string().max(100).default(""),
  })).length(1, "Select one platform."),
}).superRefine((data, ctx) => {
  data.variants.forEach((variant, index) => {
    const mediaCount = variant.media_items.length || (variant.media_url ? 1 : 0);
    if (variant.channel !== "instagram_feed" && mediaCount > 1) {
      ctx.addIssue({ code: "custom", path: ["variants", index, "media_items"], message: "Only Instagram Feed supports multiple media links." });
    }
  });
  if (data.mode === "scheduled") {
    if (!data.scheduled_date) ctx.addIssue({ code: "custom", path: ["scheduled_date"], message: "Date is required to schedule." });
    if (!data.time_slot) ctx.addIssue({ code: "custom", path: ["time_slot"], message: "Time slot is required to schedule." });
    if (!data.variants.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "Select at least one platform." });
    data.variants.forEach((variant, index) => {
      const mediaCount = variant.media_items.length || (variant.media_url ? 1 : 0);
      if (!variant.caption.trim()) ctx.addIssue({ code: "custom", path: ["variants", index, "caption"], message: "Caption is required to schedule." });
      if (variant.channel !== "whatsapp" && mediaCount === 0) ctx.addIssue({ code: "custom", path: ["variants", index, "media_items"], message: "Media is required for this platform." });
      if (variant.channel.startsWith("instagram_") && variant.channel !== "instagram_reel" && variant.media_items.some((item) => !item.alt_text.trim())) ctx.addIssue({ code: "custom", path: ["variants", index, "media_items"], message: "Alt text is required for every Instagram image." });
    });
  }
});

export type CampaignStatus = z.infer<typeof CampaignStatusZod>;
export type VariantChannel = z.infer<typeof VariantChannelZod>;

export type SocialDeliveryStatus =
  | "draft" | "proposed" | "scheduled" | "due" | "processing" | "provider_processing"
  | "sent" | "failed" | "skipped" | "cancelled";

export interface SocialCalendarDelivery {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: CampaignStatus;
  post_id: string;
  variant_id: string;
  post_title: string;
  caption: string;
  description: string;
  media_url: string | null;
  media_items: Array<{ url: string; alt_text: string }>;
  hashtags: string[];
  call_to_action_link: string | null;
  call_to_action_caption: string | null;
  channel: VariantChannel;
  schedule_platform: "instagram" | "whatsapp" | "tiktok";
  scheduled_date: string | null;
  time_slot: "morning" | "afternoon" | "evening" | null;
  scheduled_at: string | null;
  status: SocialDeliveryStatus;
  attempt_count: number;
  retryable: boolean;
  next_attempt_at: string | null;
  provider_error: string | null;
}

export interface SocialCampaign {
  id: string;
  name: string;
  description: string;
  event_id: number | null;
  status: CampaignStatus;
  needs_review: boolean;
  review_reason: string | null;
  starts_on: string | null;
  ends_on: string | null;
  default_channels: VariantChannel[];
  default_assigned_to: string | null;
  launch_occurrence_at: string | null;
  launch_decision_made: boolean;
  generation_enabled: boolean;
  generation_horizon_days: number;
  generation_lead_days: number;
  generated_through: string | null;
  last_generated_at: string | null;
  next_generation_at: string | null;
  schedule_event_snapshot: Record<string, unknown>;
  current_event_snapshot: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  events?: { title: string; start_date: string; is_recurring: boolean } | null;
}

export interface SocialReviewItem {
  id: string;
  review_id: string;
  post_id: string | null;
  decision: "unresolved" | "kept" | "regenerated" | "suppression_accepted" | "cancelled";
  detail: string | null;
  previous_state: { title?: string; status?: string };
  proposed_state: Record<string, unknown>;
}

export interface SocialCampaignReview {
  id: string;
  campaign_id: string;
  reason: string;
  status: "open" | "resolved" | "superseded";
  social_post_review_items: SocialReviewItem[];
}

export interface CampaignEventOption {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  is_recurring: boolean;
  recurrence_rule_id: number | null;
  campaign_id: string | null;
}

export interface AdminUserOption {
  id: string;
  email: string;
}
