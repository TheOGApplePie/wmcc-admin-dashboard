import { assertInstagramImageUrl, InstagramImageValidationError } from "@/features/socialCampaigns/instagram/imageValidation";
import {
  getInstagramCredential,
} from "@/features/socialCampaigns/instagram/credentials";

export type ClaimedDelivery = {
  delivery_id: string;
  publisher_user_id: string | null;
  platform: "instagram" | "whatsapp" | "tiktok";
  channel:
    | "instagram_feed"
    | "instagram_story"
    | "instagram_reel"
    | "whatsapp"
    | "tiktok_reel";
  caption: string;
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

async function instagramRequest(token: string, path: string, body: Record<string, unknown>) {
  const version = process.env.META_GRAPH_API_VERSION;
  if (!version || !token) throw new Error("Instagram credentials are not configured.");
  const response = await fetch(`https://graph.instagram.com/${version}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await jsonResponse(response);
  if (!response.ok || payload.error) throw new ProviderRequestError(
    payload.error?.message ?? `Instagram returned HTTP ${response.status}.`,
    Boolean(payload.error?.is_transient) || response.status === 429 || response.status >= 500,
  );
  return payload as { id?: string };
}

async function instagramGet(token: string, path: string, fields: string) {
  const version = process.env.META_GRAPH_API_VERSION;
  if (!version || !token) throw new Error("Instagram credentials are not configured.");
  const url = new URL(`https://graph.instagram.com/${version}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const payload = await jsonResponse(response);
  if (!response.ok || payload.error) throw new ProviderRequestError(
    payload.error?.message ?? `Instagram returned HTTP ${response.status}.`,
    Boolean(payload.error?.is_transient) || response.status === 429 || response.status >= 500,
  );
  return payload as { status_code?: string;
    status?: string;
    permalink?: string;
  };
}

async function finishInstagramContainer(
  accountId: string,
  containerId: string,
  token: string,
): Promise<PublishResult> {
  const container = await instagramGet(token, containerId, "status_code,status");
  if (container.status_code === "PUBLISHED") {
    return {
      success: false,
      retryable: false, providerId: containerId,
      error: "Instagram reports this container already published. Check the account before scheduling another post.",
    };
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
    const published = await instagramRequest(token,`${accountId}/media_publish`, { creation_id: containerId });
    if (typeof published.id !== "string" || !published.id)
      return {
        success: false,
        pending: true, providerId: containerId,
        error:
          "Instagram did not return a published media ID. Check container status before attempting publication again.",
      };
    let externalUrl: string | undefined;
    try {
      externalUrl = (await instagramGet(token, published.id, "permalink")).permalink;
    } catch {
      /* Publication succeeded; a permalink lookup must not trigger another send. */
    }
    return { success: true, providerId: published.id, externalUrl };
  }
  return {
    success: false,
    pending: true,
    retryable: true,
        providerId: containerId,
    error:
      "Instagram is processing the media container. Check again in at least one minute.",
  };
}

async function publishInstagram(delivery: ClaimedDelivery): Promise<PublishResult> {
  if (!process.env.META_GRAPH_API_VERSION) return { success: false, retryable: false, error: "Instagram publishing configuration is incomplete." };
  let containerId = delivery.external_id ?? undefined;
  try {
    const { token, accountId } = await getInstagramCredential();
    const existingContainerId = delivery.external_id;
    if (existingContainerId) {
      return await finishInstagramContainer(accountId, existingContainerId, token);
    }

    if (!delivery.media_items.length)
      return {
        success: false,
        retryable: false,
        error: "Instagram requires media.",
      };
    if (delivery.channel !== "instagram_story" && (delivery.caption.length > 2200 || (delivery.caption.match(/#[^\s#]+/g) ?? []).length > 30)) {
      return { success: false, retryable: false, error: "Instagram captions must be at most 2,200 characters and contain at most 30 hashtags." };
    }
    if (delivery.channel === "instagram_feed" ||delivery.channel === "instagram_story") {
      for (const item of delivery.media_items) {
        try { await assertInstagramImageUrl(item.url, delivery.channel === "instagram_feed"); }
        catch (error) { return { success: false, retryable: !(error instanceof InstagramImageValidationError),
          error: error instanceof Error ? error.message : "Instagram image validation failed." }; }
      }
    }

    let createdContainer: { id?: string };
    if (delivery.channel === "instagram_reel") {
      const videoUrl = delivery.media_items[0]?.url;
      if (!videoUrl) return { success: false, retryable: false, error: "Instagram Reel requires a video." };
      createdContainer = await instagramRequest(token, `${accountId}/media`, {
        media_type: "REELS", video_url: videoUrl, caption: delivery.caption, share_to_feed: true,
      });
    } else if (delivery.channel === "instagram_story") {
      const item = delivery.media_items[0];
      createdContainer = await instagramRequest(token, `${accountId}/media`, { media_type: "STORIES", image_url: item.url });
    } else if (delivery.media_items.length > 1) {
      const children: string[] = [];
      for (const item of delivery.media_items) {
        const child = await instagramRequest(token, `${accountId}/media`, { image_url: item.url, alt_text: item.alt_text, is_carousel_item: true });
        if (!child.id) throw new Error("Instagram did not return a carousel item ID.");
        children.push(child.id);
      }
      createdContainer = await instagramRequest(token, `${accountId}/media`, { media_type: "CAROUSEL", children, caption: delivery.caption });
    } else {
      const item = delivery.media_items[0];
      createdContainer = await instagramRequest(token, `${accountId}/media`, { image_url: item.url, alt_text: item.alt_text, caption: delivery.caption });
    }
    if (typeof createdContainer.id !== "string" || !createdContainer.id) throw new Error("Instagram did not return a media container ID.");
    containerId = createdContainer.id;
    // Publish now if ready; otherwise the worker saves the container for the
    // next scheduled run. No separate checkpoint or polling loop is needed.
    return await finishInstagramContainer(accountId, containerId, token);
  } catch (error) {
    const failure = providerFailure(error, containerId);
    return containerId && failure.retryable
      ? { ...failure, pending: true }
      : failure;
  }
}

async function publishWhatsApp(delivery: ClaimedDelivery
): Promise<PublishResult> {
  const baseUrl = process.env.WHATSAPP_SERVICE_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!baseUrl || !token)
    return {
      success: false,
      retryable: false,
      error: "WhatsApp service configuration is incomplete.",
    };
  if (!delivery.publisher_user_id)
    return {
      success: false,
      retryable: false,
      error: "Approve this post with a publisher before sending.",
    };
  try {
    const response = await fetch(new URL("/api/whatsapp/publish", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": delivery.idempotency_key,
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        userId: delivery.publisher_user_id,
        message: delivery.caption,
        ...( delivery.media_items[0]?.url
          ? { mediaUrl: delivery.media_items[0].url }
          : {}), deliveryId: delivery.delivery_id,
      }),
    });
    const payload = await jsonResponse(response);
    if (!response.ok)
      return {
        success: false, retryable: response.status === 429 || response.status >= 500,
        error:
          payload.message ??
          `WhatsApp service returned HTTP ${response.status}.`,
      };
    if (
      payload.success !== true ||
      payload.message?.status !== "acknowledged" ||
      typeof payload.message?.id !== "string" ||
      !payload.message.id
    ) {
      return {
        success: false,
        retryable: false,
        error: "WhatsApp service did not confirm message submission.",
      };
    }
    return { success: true, providerId: payload.message.id };
  } catch (error) {
    return { success: false, retryable: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function tiktokRequest(path: string, body: Record<string, unknown>) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error("TikTok credentials are not configured.");
  const response = await fetch(`https://open.tiktokapis.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8",
    }, body: JSON.stringify(body),
  });
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
