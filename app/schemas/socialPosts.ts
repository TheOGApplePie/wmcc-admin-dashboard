import { z } from "zod";

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type SocialChannel = "ig_feed" | "ig_story" | "whatsapp";
export type SocialPostStatus = "idea" | "draft" | "scheduled" | "published" | "failed";

export interface SocialPost {
  id: string;
  title: string;
  caption: string;
  channels: SocialChannel[];
  status: SocialPostStatus;
  scheduled_at: string | null;
  media_url: string | null;
  event_id: number | null;
  event_title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EventOption {
  id: number;
  title: string;
  start_date: string;
}

// ─── Zod enums ────────────────────────────────────────────────────────────────

export const SocialChannelEnum = z.enum(["ig_feed", "ig_story", "whatsapp"]);
export const SocialPostStatusEnum = z.enum(["idea", "draft", "scheduled", "published", "failed"]);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const BasePostZod = z.object({
  title: z.string().min(1, "Title is required.").max(120, "Max 120 characters."),
  caption: z.string().max(2200, "Max 2,200 characters.").default(""),
  channels: z.array(SocialChannelEnum).min(1, "Pick at least one channel."),
  scheduled_at: z.string().nullable().optional(),
  event_id: z.coerce.number().nullable().optional(),
  media_url: z.string().nullable().optional(),
  status: SocialPostStatusEnum.default("draft"),
});

export const CreateSocialPostZod = BasePostZod;

export const UpdateSocialPostZod = BasePostZod.extend({
  id: z.uuid(),
});

export const DeleteSocialPostZod = z.object({
  id: z.uuid(),
});

export const ScheduleSocialPostZod = z.object({
  id: z.uuid(),
  scheduled_at: z.string().min(1, "Schedule date/time is required."),
});

export const PublishSocialPostZod = z.object({
  id: z.uuid(),
});

export const GetSocialPostsZod = z.object({});

export const FetchEventsForSelectZod = z.object({});

export const UploadSocialPostMediaZod = z.object({
  file: z.file().refine((f) => f.size <= 10 * 1024 * 1024, "Max file size is 10 MB."),
});

// ─── Constants ────────────────────────────────────────────────────────────────
// These reference the CSS custom properties defined in app/globals.css under
// the "Social Posts design tokens" block. Hex fallbacks are provided for
// contexts where CSS vars cannot be resolved (e.g. canvas rendering, emails).

export const CHANNEL_LABELS: Record<SocialChannel, string> = {
  ig_feed: "IG Feed",
  ig_story: "IG Story",
  whatsapp: "WhatsApp",
};

export const CHANNEL_COLORS: Record<SocialChannel, string> = {
  ig_feed:  "var(--sp-ig)",       /* #C13584 */
  ig_story: "var(--sp-ig-story)", /* #E0A53C */
  whatsapp: "var(--sp-whatsapp)", /* #25A565 */
};

// Raw hex values for contexts that need them (e.g. opacity tinting via `+ "18"`)
export const CHANNEL_COLORS_HEX: Record<SocialChannel, string> = {
  ig_feed:  "#C13584",
  ig_story: "#E0A53C",
  whatsapp: "#25A565",
};

export const STATUS_COLORS: Record<SocialPostStatus, { bg: string; text: string }> = {
  idea:      { bg: "var(--sp-status-idea-bg)",   text: "var(--sp-status-idea-text)"   },
  draft:     { bg: "var(--sp-status-draft-bg)",  text: "var(--sp-status-draft-text)"  },
  scheduled: { bg: "var(--sp-status-sched-bg)",  text: "var(--sp-status-sched-text)"  },
  published: { bg: "var(--sp-status-pub-bg)",    text: "var(--sp-status-pub-text)"    },
  failed:    { bg: "var(--sp-status-failed-bg)", text: "var(--sp-status-failed-text)" },
};
