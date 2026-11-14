import { z } from "zod";
import type { SocialCalendarPost, SocialPostStatus } from "@/app/schemas/socialCampaigns";

export const ApproveSocialPostsZod = z.object({
  posts: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() }))
    .min(1).max(100).refine((posts) => new Set(posts.map((post) => post.id)).size === posts.length, "Select each post only once."),
});

export const BulkSocialPostActionZod = ApproveSocialPostsZod.extend({
  action: z.enum(["draft", "delete"]),
});

export function canDraftPost(post: SocialCalendarPost): boolean {
  return ["draft", "proposed", "scheduled", "failed"].includes(post.status) &&
    !post.provider_processing_started_at &&
    !(post.status === "failed" && (post.retryable || post.next_attempt_at || post.external_id)) &&
    !["archived", "completed"].includes(post.campaign_status);
}

export function canDeletePost(post: SocialCalendarPost): boolean {
  return !["processing", "provider_processing", "sent", "skipped", "cancelled"].includes(post.status);
}

export function postStatusLabel(status: SocialPostStatus): string {
  if (status === "scheduled") return "Approved";
  if (status === "provider_processing") return "Publishing";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function canApprovePost(post: SocialCalendarPost): boolean {
  return (post.status === "draft" || post.status === "proposed") &&
    post.campaign_status === "active" && !post.provider_processing_started_at;
}
