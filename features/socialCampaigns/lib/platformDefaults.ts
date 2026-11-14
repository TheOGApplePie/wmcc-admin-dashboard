import type { PlatformDefaults, SocialPostChannel } from "@/app/schemas/socialCampaigns";

type EventContent = { description?: string | null; poster_url?: string | null; poster_alt?: string | null };
export function initializePlatformDefaults(event: EventContent = {}): PlatformDefaults {
  return Object.fromEntries((["instagram", "whatsapp", "tiktok"] as const).map(platform => [platform, {
    message: event.description ?? "",
    poster: event.poster_url ? { url: event.poster_url, alt_text: event.poster_alt ?? "" } : null,
  }]));
}
export function contentForChannel(defaults: PlatformDefaults, channel: SocialPostChannel, fallback: EventContent) {
  const platform = channel.startsWith("instagram_") ? "instagram" : channel === "whatsapp" ? "whatsapp" : "tiktok";
  const content = defaults[platform];
  return content ? { caption: content.message, mediaUrl: content.poster?.url ?? null, mediaAlt: content.poster?.alt_text ?? "" }
    : { caption: fallback.description ?? "", mediaUrl: fallback.poster_url ?? null, mediaAlt: fallback.poster_alt ?? "" };
}
