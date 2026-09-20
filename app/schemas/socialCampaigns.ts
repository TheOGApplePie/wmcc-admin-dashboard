import { z } from "zod";

export const CampaignTypeZod = z.enum(["standalone", "event", "recurring_event"]);
export const CampaignStatusZod = z.enum(["draft", "active", "paused", "completed", "archived"]);
export const VariantChannelZod = z.enum([
  "instagram_feed",
  "instagram_story",
  "instagram_reel",
  "whatsapp",
  "tiktok_reel",
]);

const HttpsUrlZod = z.url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS.");

export const CreateCampaignZod = z.object({
  name: z.string().trim().min(1, "Campaign name is required.").max(120),
  description: z.string().trim().max(2_000).default(""),
  campaign_type: CampaignTypeZod,
  event_id: z.coerce.number().int().positive().nullable().optional(),
  starts_on: z.iso.date().nullable().optional(),
  ends_on: z.iso.date().nullable().optional(),
  default_channels: z.array(VariantChannelZod).default([]),
  default_assigned_to: z.uuid().nullable().optional(),
}).superRefine((data, ctx) => {
  const requiresEvent = data.campaign_type !== "standalone";
  if (requiresEvent !== Boolean(data.event_id)) {
    ctx.addIssue({
      code: "custom",
      path: ["event_id"],
      message: requiresEvent ? "Event campaigns must be linked to an event." : "Standalone campaigns cannot be linked to an event.",
    });
  }
  if (data.starts_on && data.ends_on && data.ends_on < data.starts_on) {
    ctx.addIssue({ code: "custom", path: ["ends_on"], message: "End date must be on or after the start date." });
  }
});

export const UpdateCampaignZod = CreateCampaignZod.safeExtend({
  id: z.uuid(),
  status: CampaignStatusZod,
});

export const CampaignIdZod = z.object({ id: z.uuid() });

export const CampaignMediaLinkZod = z.object({
  url: HttpsUrlZod,
});

export type CampaignType = z.infer<typeof CampaignTypeZod>;
export type CampaignStatus = z.infer<typeof CampaignStatusZod>;
export type VariantChannel = z.infer<typeof VariantChannelZod>;

export interface SocialCampaign {
  id: string;
  name: string;
  description: string;
  campaign_type: CampaignType;
  event_id: number | null;
  status: CampaignStatus;
  needs_review: boolean;
  review_reason: string | null;
  starts_on: string | null;
  ends_on: string | null;
  default_channels: VariantChannel[];
  default_assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  events?: { title: string; start_date: string; is_recurring: boolean } | null;
}
