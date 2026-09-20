import { getSocialPosts, fetchEventsForSelect, fetchAdminUsers } from "@/actions/socialPosts";
import SocialPostsClient from "@/features/socialPosts/components/SocialPostsClient";
import { PageShell } from "@/app/components/ui/PageShell";
import { requirePermission } from "@/utils/permissions";

export const dynamic = "force-dynamic";

export default async function SocialPostsPage() {
  const { supabase } = await requirePermission("social", "view");
  const [postsResult, eventsResult, usersResult, editPerm, schedulePerm, sendPerm, deletePerm] = await Promise.all([
    getSocialPosts({}),
    fetchEventsForSelect({}),
    fetchAdminUsers({}),
    supabase.rpc("has_perm", { p_module: "social", p_action: "edit" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "schedule" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "send" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "delete" }),
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
        permissions={{
          edit: Boolean(editPerm.data),
          schedule: Boolean(schedulePerm.data),
          send: Boolean(sendPerm.data),
          delete: Boolean(deletePerm.data),
        }}
      />
    </PageShell>
  );
}
