import { getSocialPosts, fetchEventsForSelect, fetchAdminUsers } from "@/actions/socialPosts";
import SocialPostsClient from "@/features/socialPosts/components/SocialPostsClient";

export const dynamic = "force-dynamic";

export default async function SocialPostsPage() {
  const [postsResult, eventsResult, usersResult] = await Promise.all([
    getSocialPosts({}),
    fetchEventsForSelect({}),
    fetchAdminUsers({}),
  ]);

  if (postsResult?.data?.error || !postsResult?.data?.data) {
    throw new Error(postsResult?.data?.error ?? "Failed to load posts.");
  }

  return (
    <SocialPostsClient
      initialPosts={postsResult.data.data}
      events={eventsResult?.data?.data ?? []}
      adminUsers={usersResult?.data?.data ?? []}
    />
  );
}
