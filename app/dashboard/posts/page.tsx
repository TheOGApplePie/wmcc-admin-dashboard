import { getSocialPosts, fetchEventsForSelect, fetchAdminUsers } from "@/actions/socialPosts";
import SocialPostsClient from "@/features/socialPosts/components/SocialPostsClient";
import { PageShell } from "@/app/components/ui/PageShell";

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
    <PageShell title="Social Posts" subtitle="Plan & schedule across Instagram and WhatsApp" noPad>
      <SocialPostsClient
        initialPosts={postsResult.data.data}
        events={eventsResult?.data?.data ?? []}
        adminUsers={usersResult?.data?.data ?? []}
      />
    </PageShell>
  );
}
