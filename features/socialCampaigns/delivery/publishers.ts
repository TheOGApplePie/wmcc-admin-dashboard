export type ClaimedDelivery = {
  delivery_id: string;
  platform: "instagram" | "whatsapp" | "tiktok";
  channel: "instagram_feed" | "instagram_story" | "instagram_reel" | "whatsapp" | "tiktok_reel";
  caption: string;
  description: string;
  media_items: Array<{ url: string; alt_text: string }>;
  attempt_number: number;
  idempotency_key: string;
  external_id: string | null;
};

export type PublishResult = {
  success: boolean;
  retryable?: boolean;
  providerId?: string;
  externalUrl?: string;
  error?: string;
};

async function jsonResponse(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

async function instagramRequest(path: string, body: Record<string, unknown>) {
  const version = process.env.META_GRAPH_API_VERSION;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!version || !token) throw new Error("Instagram credentials are not configured.");
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const payload = await jsonResponse(response);
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `Instagram returned HTTP ${response.status}.`);
  return payload as { id?: string };
}

async function publishInstagram(delivery: ClaimedDelivery): Promise<PublishResult> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!accountId || !process.env.META_GRAPH_API_VERSION || !process.env.INSTAGRAM_ACCESS_TOKEN) return { success: false, retryable: false, error: "Instagram publishing configuration is incomplete." };
  if (delivery.channel === "instagram_reel") return { success: false, retryable: false, error: "Instagram Reel publishing requires video media and is not enabled in the image-first workflow." };
  try {
    let containerId = delivery.external_id;
    if (!containerId) {
      if (delivery.channel === "instagram_story") {
        const item = delivery.media_items[0];
        const result = await instagramRequest(`${accountId}/media`, { media_type: "STORIES", image_url: item.url });
        containerId = result.id ?? null;
      } else if (delivery.media_items.length > 1) {
        const children: string[] = [];
        for (const item of delivery.media_items) {
          const child = await instagramRequest(`${accountId}/media`, { image_url: item.url, alt_text: item.alt_text, is_carousel_item: true });
          if (!child.id) throw new Error("Instagram did not return a carousel item ID.");
          children.push(child.id);
        }
        const result = await instagramRequest(`${accountId}/media`, { media_type: "CAROUSEL", children, caption: delivery.caption });
        containerId = result.id ?? null;
      } else {
        const item = delivery.media_items[0];
        const result = await instagramRequest(`${accountId}/media`, { image_url: item.url, alt_text: item.alt_text, caption: delivery.caption });
        containerId = result.id ?? null;
      }
    }
    if (!containerId) throw new Error("Instagram did not return a media container ID.");
    const published = await instagramRequest(`${accountId}/media_publish`, { creation_id: containerId });
    return { success: true, providerId: published.id ?? containerId };
  } catch (error) {
    return { success: false, retryable: true, providerId: delivery.external_id ?? undefined, error: error instanceof Error ? error.message : String(error) };
  }
}

async function publishWhatsApp(delivery: ClaimedDelivery): Promise<PublishResult> {
  const endpoint = process.env.WHATSAPP_ENDPOINT_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const destination = process.env.WHATSAPP_DESTINATION;
  if (!endpoint || !token || !destination) return { success: false, retryable: false, error: "WhatsApp endpoint configuration is incomplete." };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": delivery.idempotency_key },
      // TODO: Align these field names with the final WhatsApp endpoint contract.
      body: JSON.stringify({ destination, caption: delivery.caption, mediaUrl: delivery.media_items[0]?.url ?? null, deliveryId: delivery.delivery_id }),
    });
    const payload = await jsonResponse(response);
    if (!response.ok) return { success: false, retryable: response.status === 429 || response.status >= 500, error: payload.message ?? `WhatsApp endpoint returned HTTP ${response.status}.` };
    return { success: true, providerId: payload.id ?? payload.messageId, externalUrl: payload.url };
  } catch (error) {
    return { success: false, retryable: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function tiktokRequest(path: string, body: Record<string, unknown>) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error("TikTok credentials are not configured.");
  const response = await fetch(`https://open.tiktokapis.com${path}`, { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body) });
  const payload = await jsonResponse(response);
  if (!response.ok || (payload.error?.code && payload.error.code !== "ok")) throw new Error(payload.error?.message ?? `TikTok returned HTTP ${response.status}.`);
  return payload;
}

async function publishTikTok(delivery: ClaimedDelivery): Promise<PublishResult> {
  if (!process.env.TIKTOK_ACCESS_TOKEN) return { success: false, retryable: false, error: "TIKTOK_ACCESS_TOKEN is not configured." };
  try {
    if (delivery.external_id) {
      const status = await tiktokRequest("/v2/post/publish/status/fetch/", { publish_id: delivery.external_id });
      const state = status.data?.status;
      if (["PUBLISH_COMPLETE", "SUCCESS", "PUBLISHED"].includes(state)) return { success: true, providerId: delivery.external_id };
      if (["FAILED", "PUBLISH_FAILED"].includes(state)) return { success: false, retryable: false, providerId: delivery.external_id, error: status.data?.fail_reason ?? "TikTok publishing failed." };
      return { success: false, retryable: true, providerId: delivery.external_id, error: `TikTok is still processing the post (${state ?? "unknown"}).` };
    }
    const creator = await tiktokRequest("/v2/post/publish/creator_info/query/", {});
    if (!creator.data?.privacy_level_options?.includes("PUBLIC_TO_EVERYONE")) return { success: false, retryable: false, error: "The TikTok account does not currently permit public API posts." };
    const mediaUrl = delivery.media_items[0]?.url;
    if (!mediaUrl) return { success: false, retryable: false, error: "TikTok requires a video URL." };
    const initialized = await tiktokRequest("/v2/post/publish/video/init/", {
      post_info: { title: delivery.caption, privacy_level: "PUBLIC_TO_EVERYONE", disable_comment: false, disable_duet: true, disable_stitch: true, video_cover_timestamp_ms: 0, is_aigc: false, brand_organic_toggle: process.env.TIKTOK_BRAND_ORGANIC === "true" },
      source_info: { source: "PULL_FROM_URL", video_url: mediaUrl },
    });
    const publishId = initialized.data?.publish_id;
    if (!publishId) throw new Error("TikTok did not return a publish ID.");
    return { success: false, retryable: true, providerId: publishId, error: "TikTok accepted the post and is processing it." };
  } catch (error) {
    return { success: false, retryable: true, providerId: delivery.external_id ?? undefined, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publishDelivery(delivery: ClaimedDelivery): Promise<PublishResult> {
  if (delivery.platform === "instagram") return publishInstagram(delivery);
  if (delivery.platform === "whatsapp") return publishWhatsApp(delivery);
  return publishTikTok(delivery);
}
