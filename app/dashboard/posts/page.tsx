import { getSocialPosts, fetchEventsForSelect, fetchSocialAssignees } from "@/actions/socialPosts";
import SocialPostsClient from "@/features/socialPosts/components/SocialPostsClient";
import { PageShell } from "@/app/components/ui/PageShell";
import { requirePermission } from "@/features/access/server";

export const dynamic = "force-dynamic";

export default async function SocialPostsPage() {
  await requirePermission("social", "view");
  const [postsResult, eventsResult, usersResult] = await Promise.all([
    getSocialPosts({}),
    fetchEventsForSelect({}),
    fetchSocialAssignees({}),
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
