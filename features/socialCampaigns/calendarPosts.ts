import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialCalendarPost } from "@/app/schemas/socialCampaigns";

export const CALENDAR_POST_FIELDS = "id,campaign_id,version,needs_review,review_reason,title,caption,media_urls,media_alt_texts,hashtags,channel,schedule_platform,scheduled_date,time_slot,scheduled_at,status,publisher_user_id,attempt_count,retryable,next_attempt_at,provider_error,external_id,provider_processing_started_at,social_campaigns!inner(name,status)";
type PostRow = Omit<SocialCalendarPost, "campaign_name" | "campaign_status" | "post_title" | "media_items"> & {
  title: string; media_urls: string[]; media_alt_texts: string[];
  social_campaigns: { name: string; status: SocialCalendarPost["campaign_status"] };
};
export function calendarPost(row: PostRow): SocialCalendarPost {
  const { title, media_urls, media_alt_texts, social_campaigns, ...post } = row;
  return { ...post, post_title: title, campaign_name: social_campaigns.name, campaign_status: social_campaigns.status,
    media_items: media_urls.map((url, index) => ({ url, alt_text: media_alt_texts[index] ?? "" })) };
}
export async function readCalendarPost(supabase: SupabaseClient, id: string): Promise<SocialCalendarPost> {
  const { data, error } = await supabase.from("social_posts").select(CALENDAR_POST_FIELDS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return calendarPost(data as unknown as PostRow);
}
