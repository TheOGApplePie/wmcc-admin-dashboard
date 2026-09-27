import type { VariantChannel } from "@/app/schemas/socialCampaigns";

export const CHANNELS: Array<{ value: VariantChannel; label: string }> = [
  { value: "instagram_feed", label: "Instagram Feed" },
  { value: "instagram_story", label: "Instagram Story" },
  { value: "instagram_reel", label: "Instagram Reel" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "tiktok_reel", label: "TikTok Reel" },
];
