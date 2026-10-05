import { z } from "zod";

export const CampaignStatusZod = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);
export const SocialPostChannelZod = z.enum([
  "instagram_feed",
  "instagram_story",
  "instagram_reel",
  "whatsapp",
  "tiktok_reel",
]);

const HttpsUrlZod = z
  .url()
  .refine(
    (value) => URL.canParse(value) && new URL(value).protocol === "https:",
    "URL must use HTTPS.",
  );
export const SocialMediaItemZod = z.object({
  url: HttpsUrlZod,
  alt_text: z.string().trim().max(1_000),
});

export const CreateCampaignZod = z
  .object({
    name: z.string().trim().min(1, "Campaign name is required.").max(120),
    description: z.string().trim().max(2_000).default(""),
    event_id: z.coerce.number().int().positive().nullable().optional(),
    starts_on: z.iso.date().nullable().optional(),
    ends_on: z.iso.date().nullable().optional(),
    default_channels: z.array(SocialPostChannelZod).default([]),
    default_assigned_to: z.uuid().nullable().optional(),
    launch_occurrence_at: z.iso.datetime().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.starts_on && data.ends_on && data.ends_on < data.starts_on) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_on"],
        message: "End date must be on or after the start date.",
      });
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

export const ReviewVerdictZod = z.object({ campaign_id: z.uuid(), version: z.number().int().positive() });

export const CampaignMediaLinkZod = z.object({
  url: HttpsUrlZod,
});

const SocialPostFieldsZod = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    caption: z.string().max(2_200),
    description: z.string().max(2_000),
    media_url: z.union([HttpsUrlZod, z.literal("")]),
    media_items: z.array(SocialMediaItemZod).max(10).default([]),
    hashtags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    call_to_action_link: z.union([HttpsUrlZod, z.literal("")]),
    call_to_action_caption: z.string().max(100).default(""),
    channel: SocialPostChannelZod,
    scheduled_date: z.iso.date().nullable(),
    time_slot: z.enum(["morning", "afternoon", "evening"]).nullable(),
    status: z.enum(["draft", "scheduled"]),
  });

export const UpdateSocialPostZod = SocialPostFieldsZod
  .superRefine((data, ctx) => {
    const mediaCount = data.media_items.length || (data.media_url ? 1 : 0);
    if (data.channel !== "instagram_feed" && mediaCount > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["media_items"],
        message: "Only Instagram Feed supports multiple media links.",
      });
    }
    if (data.status === "scheduled") {
      if (!data.caption.trim()) ctx.addIssue({code: "custom", path: ["caption"], message: "Caption is required to schedule."});
      if (data.channel !== "whatsapp" && !data.media_items.length) ctx.addIssue({code: "custom", path: ["media_items"], message: "Media is required for this platform."});
      if (!data.scheduled_date)
        ctx.addIssue({
          code: "custom",
          path: ["scheduled_date"],
          message: "Date is required.",
        });
      if (!data.time_slot)
        ctx.addIssue({
          code: "custom",
          path: ["time_slot"],
          message: "Time slot is required.",
        });
      if (
        data.channel.startsWith("instagram_") &&
        data.channel !== "instagram_reel" &&
        data.media_items.some((item) => !item.alt_text.trim())
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["media_items"],
          message: "Alt text is required for every Instagram image.",
        });
      }
    }
  });

export const DeleteSocialPostZod = z.object({ id: z.uuid() });

export const CreateManualSocialPostZod = SocialPostFieldsZod
  .omit({id: true, version: true, status: true})
  .extend({campaign_id: z.uuid(), mode: z.enum(["draft", "scheduled"])})
  .superRefine((data, ctx) => {
    const result = UpdateSocialPostZod.safeParse({...data, id: "00000000-0000-4000-8000-000000000000", version: 1, status: data.mode});
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({...issue, code: "custom"});
  });

export type CampaignStatus = z.infer<typeof CampaignStatusZod>;
export type SocialPostChannel = z.infer<typeof SocialPostChannelZod>;

export type SocialPostStatus =
  | "draft"
  | "proposed"
  | "scheduled"
  | "due"
  | "processing"
  | "provider_processing"
  | "sent"
  | "failed"
  | "skipped"
  | "cancelled";

export interface SocialCalendarPost {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: CampaignStatus;
  version: number;
  needs_review: boolean;
  review_reason: string | null;
  post_title: string;
  caption: string;
  description: string;
  media_url: string | null;
  media_items: Array<{ url: string; alt_text: string }>;
  hashtags: string[];
  call_to_action_link: string | null;
  call_to_action_caption: string | null;
  channel: SocialPostChannel;
  schedule_platform: "instagram" | "whatsapp" | "tiktok";
  scheduled_date: string | null;
  time_slot: "morning" | "afternoon" | "evening" | null;
  scheduled_at: string | null;
  status: SocialPostStatus;
  attempt_count: number;
  retryable: boolean;
  next_attempt_at: string | null;
  provider_error: string | null;
}

export interface SocialCampaign {
  id: string;
  version: number;
  name: string;
  description: string;
  event_id: number | null;
  status: CampaignStatus;
  needs_review: boolean;
  review_reason: string | null;
  starts_on: string | null;
  ends_on: string | null;
  default_channels: SocialPostChannel[];
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
  events?: {
    title: string;
    publication_status: "draft" | "published" | "archived";
    event_schedules: { id: string; recurrence_rule_id: number | null }[];
  } | null;
}

export interface CampaignEventOption {
  id: number;
  title: string;
  publication_status: "draft" | "published" | "archived";
  is_recurring: boolean;
  campaign_id: string | null;
}

export interface AdminUserOption {
  id: string;
  email: string;
}
