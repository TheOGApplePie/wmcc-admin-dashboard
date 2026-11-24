import { z } from "zod";
import { CampaignStatusZod } from "@/app/schemas/socialCampaigns";

export const SocialPostQuery = z.object({
  from: z.iso.date().optional(),
  through: z.iso.date().optional(),
  campaignId: z.uuid().optional(),
  excludeCampaignId: z.uuid().optional(),
  campaignStatus: z.union([CampaignStatusZod, z.literal("current"), z.literal("all")]).default("all"),
  platform: z.enum(["all", "instagram", "whatsapp", "tiktok"]).default("all"),
  status: z.enum(["all", "draft", "proposed", "scheduled", "due", "processing", "provider_processing", "sent", "failed", "skipped", "cancelled"]).default("all"),
  copySourceId: z.uuid().optional(),
  copyTargets: z.boolean().default(false),
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
}).refine(value => !value.from || !value.through || (value.from < value.through && Date.parse(value.through) - Date.parse(value.from) <= 367 * 86400000), "Choose a range of at most one year.");
export type SocialPostQueryInput = z.input<typeof SocialPostQuery>;
