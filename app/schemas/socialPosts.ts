import { z } from "zod";

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type SocialChannel    = "ig_feed" | "ig_story" | "whatsapp";
export type SocialPostStatus = "idea" | "draft" | "scheduled" | "published" | "failed";
export type SocialPostType   = "ANNOUNCEMENT" | "GENERAL" | "REMINDER";
export type TimeSlot         = "morning" | "afternoon" | "evening";

export interface SocialPost {
  id: string;
  title: string;
  caption: string;
  hashtags: string[];
  channels: SocialChannel[];
  status: SocialPostStatus;
  post_type: SocialPostType;
  time_slot: TimeSlot | null;
  scheduled_at: string | null;
  media_url: string | null;
  event_id: number | null;
  event_title: string | null;
  assigned_to: string | null;
  last_notified_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EventOption {
  id: number;
  title: string;
  start_date: string;
}

export interface AdminUserOption {
  id: string;
  email: string;
}

// ─── Zod enums ────────────────────────────────────────────────────────────────

export const SocialChannelEnum    = z.enum(["ig_feed", "ig_story", "whatsapp"]);
export const SocialPostStatusEnum = z.enum(["idea", "draft", "scheduled", "published", "failed"]);
export const SocialPostTypeEnum   = z.enum(["ANNOUNCEMENT", "GENERAL", "REMINDER"]);
export const TimeSlotEnum         = z.enum(["morning", "afternoon", "evening"]);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const BasePostZod = z.object({
  title:        z.string().min(1, "Title is required.").max(120, "Max 120 characters."),
  caption:      z.string().max(1000, "Max 1,000 characters.").default(""),
  hashtags:     z.array(z.string()).max(30, "Max 30 hashtags.").default([]),
  channels:     z.array(SocialChannelEnum).default([]),
  post_type:    SocialPostTypeEnum.default("GENERAL"),
  time_slot:    TimeSlotEnum.nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
  event_id:     z.coerce.number().nullable().optional(),
  media_url:    z.string().nullable().optional(),
  assigned_to:  z.uuid().nullable().optional(),
  status:       SocialPostStatusEnum.default("draft"),
});

export const CreateSocialPostZod = BasePostZod;

export const UpdateSocialPostZod = BasePostZod.extend({
  id: z.uuid(),
});

export const DeleteSocialPostZod = z.object({
  id: z.uuid(),
});

export const ScheduleSocialPostZod = z.object({
  id:           z.uuid(),
  scheduled_at: z.string().min(1, "Schedule date/time is required."),
});

export const PublishSocialPostZod = z.object({
  id: z.uuid(),
});

export const GetSocialPostsZod       = z.object({});
export const FetchEventsForSelectZod = z.object({});
export const FetchAdminUsersZod      = z.object({});

export const UploadSocialPostMediaZod = z.object({
  file: z.file().refine((f) => f.size <= 10 * 1024 * 1024, "Max file size is 10 MB."),
});

// ─── Constants ────────────────────────────────────────────────────────────────
// CSS custom properties are defined in app/globals.css under "Social Posts design tokens".
// Hex values are provided via CHANNEL_COLOURS_HEX for contexts that require string
// concatenation (e.g. opacity tinting) where CSS vars cannot be used.

export const CHANNEL_LABELS: Record<SocialChannel, string> = {
  ig_feed:  "IG Feed",
  ig_story: "IG Story",
  whatsapp: "WhatsApp",
};

export const CHANNEL_COLOURS: Record<SocialChannel, string> = {
  ig_feed:  "var(--sp-ig)",       /* #C13584 */
  ig_story: "var(--sp-ig-story)", /* #E0A53C */
  whatsapp: "var(--sp-whatsapp)", /* #25A565 */
};

export const CHANNEL_COLOURS_HEX: Record<SocialChannel, string> = {
  ig_feed:  "#C13584",
  ig_story: "#E0A53C",
  whatsapp: "#25A565",
};

export const POST_TYPE_LABELS: Record<SocialPostType, string> = {
  ANNOUNCEMENT: "Announcement",
  GENERAL:      "General",
  REMINDER:     "Reminder",
};

export const POST_TYPE_COLOURS: Record<SocialPostType, string> = {
  ANNOUNCEMENT: "#0F8073",
  GENERAL:      "#6B726E",
  REMINDER:     "#E0A53C",
};

export const STATUS_COLOURS: Record<SocialPostStatus, { bg: string; text: string }> = {
  idea:      { bg: "var(--sp-status-idea-bg)",   text: "var(--sp-status-idea-text)"   },
  draft:     { bg: "var(--sp-status-draft-bg)",  text: "var(--sp-status-draft-text)"  },
  scheduled: { bg: "var(--sp-status-sched-bg)",  text: "var(--sp-status-sched-text)"  },
  published: { bg: "var(--sp-status-pub-bg)",    text: "var(--sp-status-pub-text)"    },
  failed:    { bg: "var(--sp-status-failed-bg)", text: "var(--sp-status-failed-text)" },
};

// Slot configuration — morning 9am, afternoon 1pm, evening 6pm
export const SLOT_TIMES: Record<TimeSlot, string> = {
  morning:   "09:00:00",
  afternoon: "13:00:00",
  evening:   "18:00:00",
};

export const SLOT_LABELS: Record<TimeSlot, string> = {
  morning:   "Morning · 9 am",
  afternoon: "Afternoon · 1 pm",
  evening:   "Evening · 6 pm",
};

// IG image aspect ratio rules (enforced on upload in useMediaUpload hook)
export const IG_STORY_RATIO = { max: 0.64 }; // 9:16 = 0.5625, allow ≤ 0.64
