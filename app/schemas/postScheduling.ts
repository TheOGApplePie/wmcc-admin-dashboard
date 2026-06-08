import { z } from "zod";

// ─── Literal types ────────────────────────────────────────────────────────────

export type PostType = "ANNOUNCEMENT" | "GENERAL" | "REMINDER";
export type TimeSlot = "morning" | "afternoon" | "evening";
export type PostStatus =
  | "draft"
  | "scheduled"
  | "posted"
  | "failed";
export type PlatformType =
  | "instagram_feed"
  | "instagram_story"
  | "whatsapp";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface PostCampaign {
  id: number;
  event_id: number;
  is_recurring_anchor: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPost {
  id: number;
  campaign_id: number;
  event_id: number;
  post_type: PostType;
  is_recurring_reminder: boolean;
  occurrence_date: string | null; // 'YYYY-MM-DD'
  platforms: PlatformType[];
  cross_post_facebook: boolean;
  banner_image_url: string | null;
  caption: string | null;
  hashtags: string[];
  whatsapp_text: string | null;
  scheduled_date: string; // 'YYYY-MM-DD'
  time_slot: TimeSlot;
  scheduled_at: string; // ISO UTC timestamptz
  status: PostStatus;
  retry_count: number;
  next_retry_at: string | null;
  requires_manual: boolean;
  created_by_email: string | null;
  assigned_to_email: string | null;
  last_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostLog {
  id: number;
  post_id: number;
  timestamp: string;
  status: PostStatus;
  message: string | null;
  platform: PlatformType | null;
}

export interface ScheduledPostWithEvent extends ScheduledPost {
  events: {
    id: number;
    title: string;
    start_date: string;
    end_date: string;
    is_recurring: boolean;
  };
}

export interface WeekConstraintResult {
  feedPostsThisWeek: number;
  storyPostsThisWeek: number;
  feedCapacityRemaining: number;
  storyCapacityRemaining: number;
  violations: string[];
}

// ─── Zod enum constants ───────────────────────────────────────────────────────

const PostTypeEnum = z.enum(["ANNOUNCEMENT", "GENERAL", "REMINDER"]);
const TimeSlotEnum = z.enum(["morning", "afternoon", "evening"]);
const PostStatusEnum = z.enum([
  "draft",
  "scheduled",
  "posted",
  "failed",
]);
const PlatformEnum = z.enum([
  "instagram_feed",
  "instagram_story",
  "whatsapp",
]);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Zod schemas ──────────────────────────────────────────────────────────────

export const InitializeCampaignZod = z.object({
  event_id: z.coerce.number(),
  generate: z.boolean(),
});

// Shared post fields — no content validation at the schema level so that
// admins can save incomplete drafts. Content completeness is enforced by the
// UI at schedule-time, not at save-time.
const PostFieldsZod = z.object({
  campaign_id: z.coerce.number(),
  event_id: z.coerce.number(),
  post_type: PostTypeEnum,
  platforms: z.array(PlatformEnum).min(1, "Select at least one platform."),
  cross_post_facebook: z.boolean().default(false),
  banner_image_url: z.nullable(z.url()),
  caption: z.nullable(z.string().max(2200)),
  hashtags: z.array(z.string()).default([]),
  whatsapp_text: z.nullable(z.string().max(4096)),
  scheduled_date: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD"),
  time_slot: TimeSlotEnum,
});

export const CreatePostZod = PostFieldsZod;

export const UpdatePostZod = PostFieldsZod.extend({
  id: z.coerce.number(),
  status: PostStatusEnum,
});

export const DeletePostZod = z.object({
  id: z.coerce.number(),
});

export const SchedulePostZod = z.object({
  id: z.coerce.number(),
  scheduled_date: z.string().regex(DATE_REGEX, "Must be YYYY-MM-DD"),
  time_slot: TimeSlotEnum,
});

export const RevertPostZod = z.object({
  id: z.coerce.number(),
});

export const MarkPostManualSentZod = z.object({
  id: z.coerce.number(),
});

export const BulkDeletePostsZod = z.object({
  campaign_id: z.coerce.number(),
  statuses: z.array(z.enum(["draft", "scheduled"])),
});

export const RegenerateScheduleZod = z.object({
  event_id: z.coerce.number(),
  campaign_id: z.coerce.number(),
});

export const FetchPostsZod = z.object({
  event_id: z.coerce.number(),
});

export const FetchCampaignZod = z.object({
  event_id: z.coerce.number(),
});

export const FetchAuditLogsZod = z.object({
  entity_type: z.string(),
  entity_id: z.coerce.number(),
});

export const AssignPostZod = z.object({
  id: z.coerce.number(),
  assigned_to_email: z.nullable(z.email()),
});
