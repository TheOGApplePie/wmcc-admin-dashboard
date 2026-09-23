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
  pending?: boolean;
  retryable?: boolean;
  providerId?: string;
  externalUrl?: string;
  error?: string;
};

class ProviderRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function providerFailure(error: unknown, providerId?: string): PublishResult {
  return {
    success: false,
    retryable: error instanceof ProviderRequestError ? error.retryable : true,
    providerId,
    error: error instanceof Error ? error.message : String(error),
  };
}

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
  if (!response.ok || payload.error) throw new ProviderRequestError(
    payload.error?.message ?? `Instagram returned HTTP ${response.status}.`,
    Boolean(payload.error?.is_transient) || response.status === 429 || response.status >= 500,
  );
  return payload as { id?: string };
}

async function instagramGet(path: string, fields: string) {
  const version = process.env.META_GRAPH_API_VERSION;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!version || !token) throw new Error("Instagram credentials are not configured.");
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const payload = await jsonResponse(response);
  if (!response.ok || payload.error) throw new ProviderRequestError(
    payload.error?.message ?? `Instagram returned HTTP ${response.status}.`,
    Boolean(payload.error?.is_transient) || response.status === 429 || response.status >= 500,
  );
  return payload as { status_code?: string; status?: string };
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

async function finishInstagramContainer(
  accountId: string,
  containerId: string,
  waitForProcessing: boolean,
): Promise<PublishResult> {
  // A slot cron should normally create and publish in the same invocation. Briefly
  // poll newly-created containers; later crons remain the recovery path when Meta
  // needs longer than this bounded wait.
  const checks = waitForProcessing ? 5 : 1;
  for (let check = 0; check < checks; check += 1) {
    if (check > 0) await delay(2_000);
    const container = await instagramGet(containerId, "status_code,status");
    if (container.status_code === "PUBLISHED") {
      return { success: true, providerId: containerId };
    }
    if (container.status_code === "ERROR" || container.status_code === "EXPIRED") {
      return {
        success: false,
        retryable: false,
        providerId: containerId,
        error: container.status ?? `Instagram container ${container.status_code.toLowerCase()}.`,
      };
    }
    if (container.status_code === "FINISHED") {
      const published = await instagramRequest(`${accountId}/media_publish`, { creation_id: containerId });
      return { success: true, providerId: published.id ?? containerId };
    }
  }
  return {
    success: false,
    pending: true,
    retryable: true,
    providerId: containerId,
    error: "Instagram accepted the media container and is still processing it.",
  };
}

async function publishInstagram(delivery: ClaimedDelivery): Promise<PublishResult> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!accountId || !process.env.META_GRAPH_API_VERSION || !process.env.INSTAGRAM_ACCESS_TOKEN) return { success: false, retryable: false, error: "Instagram publishing configuration is incomplete." };
  try {
    const existingContainerId = delivery.external_id;
    if (existingContainerId) {
      return finishInstagramContainer(accountId, existingContainerId, false);
    }

    let createdContainer: { id?: string };
    if (delivery.channel === "instagram_reel") {
      const videoUrl = delivery.media_items[0]?.url;
      if (!videoUrl) return { success: false, retryable: false, error: "Instagram Reel requires a video." };
      createdContainer = await instagramRequest(`${accountId}/media`, {
        media_type: "REELS", video_url: videoUrl, caption: delivery.caption, share_to_feed: true,
      });
    } else if (delivery.channel === "instagram_story") {
      const item = delivery.media_items[0];
      createdContainer = await instagramRequest(`${accountId}/media`, { media_type: "STORIES", image_url: item.url });
    } else if (delivery.media_items.length > 1) {
      const children: string[] = [];
      for (const item of delivery.media_items) {
        const child = await instagramRequest(`${accountId}/media`, { image_url: item.url, alt_text: item.alt_text, is_carousel_item: true });
        if (!child.id) throw new Error("Instagram did not return a carousel item ID.");
        children.push(child.id);
      }
      createdContainer = await instagramRequest(`${accountId}/media`, { media_type: "CAROUSEL", children, caption: delivery.caption });
    } else {
      const item = delivery.media_items[0];
      createdContainer = await instagramRequest(`${accountId}/media`, { image_url: item.url, alt_text: item.alt_text, caption: delivery.caption });
    }
    if (!createdContainer.id) throw new Error("Instagram did not return a media container ID.");
    return finishInstagramContainer(accountId, createdContainer.id, true);
  } catch (error) {
    const failure = providerFailure(error, delivery.external_id ?? undefined);
    return delivery.external_id && failure.retryable ? { ...failure, pending: true } : failure;
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
  if (!response.ok || (payload.error?.code && payload.error.code !== "ok")) throw new ProviderRequestError(
    payload.error?.message ?? `TikTok returned HTTP ${response.status}.`,
    response.status === 429 || response.status >= 500 || payload.error?.code === "internal_error" || payload.error?.code === "rate_limit_exceeded",
  );
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
      return { success: false, pending: true, retryable: true, providerId: delivery.external_id, error: `TikTok is still processing the post (${state ?? "unknown"}).` };
    }
    const creator = await tiktokRequest("/v2/post/publish/creator_info/query/", {});
    if (!creator.data?.privacy_level_options?.includes("PUBLIC_TO_EVERYONE")) return { success: false, retryable: false, error: "The TikTok account does not currently permit public API posts." };
    if (creator.data?.comment_disabled) return { success: false, retryable: false, error: "The TikTok account currently disables comments, but this publication requires comments to be enabled." };
    const mediaUrl = delivery.media_items[0]?.url;
    if (!mediaUrl) return { success: false, retryable: false, error: "TikTok requires a video URL." };
    const initialized = await tiktokRequest("/v2/post/publish/video/init/", {
      post_info: { title: delivery.caption, privacy_level: "PUBLIC_TO_EVERYONE", disable_comment: false, disable_duet: true, disable_stitch: true, video_cover_timestamp_ms: 0, is_aigc: false, brand_organic_toggle: process.env.TIKTOK_BRAND_ORGANIC === "true" },
      source_info: { source: "PULL_FROM_URL", video_url: mediaUrl },
    });
    const publishId = initialized.data?.publish_id;
    if (!publishId) throw new Error("TikTok did not return a publish ID.");
    return { success: false, pending: true, retryable: true, providerId: publishId, error: "TikTok accepted the post and is processing it." };
  } catch (error) {
    const failure = providerFailure(error, delivery.external_id ?? undefined);
    return delivery.external_id && failure.retryable ? { ...failure, pending: true } : failure;
  }
}

export function publishDelivery(delivery: ClaimedDelivery): Promise<PublishResult> {
  if (delivery.platform === "instagram") return publishInstagram(delivery);
  if (delivery.platform === "whatsapp") return publishWhatsApp(delivery);
  return publishTikTok(delivery);
}
