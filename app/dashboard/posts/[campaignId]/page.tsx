import styles from "@/features/socialCampaigns/components/CampaignLayout.module.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCampaignEventOptions,
  getSocialAdminUsers,
  getSocialCalendarPosts,
  getSocialCampaign,
} from "@/actions/socialCampaigns";
import { PageShell } from "@/app/components/ui/PageShell";
import CampaignLifecycleControls from "@/features/socialCampaigns/components/CampaignLifecycleControls";
import CampaignPageActions from "@/features/socialCampaigns/components/CampaignPageActions";
import CampaignReviewPanel from "@/features/socialCampaigns/components/CampaignReviewPanel";
import { requirePermission } from "@/utils/permissions";

export const dynamic = "force-dynamic";

export default async function CampaignPage({
  params,
}: Readonly<{ params: Promise<{ campaignId: string }> }>) {
  const { campaignId } = await params;
  const { supabase } = await requirePermission("social", "view");
  const [
    { data: result },
    { data: deliveriesResult },
    { data: eventsResult },
    { data: usersResult },
    editPerm,
    publishPerm,
    deletePerm,
  ] = await Promise.all([
    getSocialCampaign({ id: campaignId }),
    getSocialCalendarPosts(),
    getCampaignEventOptions(),
    getSocialAdminUsers(),
    supabase.rpc("has_perm", { p_module: "social", p_action: "edit" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "publish" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "delete" }),
  ]);
  if (result?.error || !result?.data) notFound();
  const campaign = result.data;

  return (
    <PageShell
      title={campaign.name}
      subtitle={campaign.events?.title ?? "Standalone campaign"}
      noPad
    >
      <div className={`${styles.page} bg-canvas p-6`}>
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/dashboard/posts"
              className="text-sm font-semibold text-teal"
            >
              ← All campaigns
            </Link>
            <CampaignLifecycleControls
              id={campaign.id}
              status={campaign.status}
              eventPublished={
                !campaign.event_id ||
                campaign.events?.publication_status === "published"
              }
              canPublish={Boolean(publishPerm.data)}
              canDelete={Boolean(deletePerm.data)}
            />
          </div>

          {campaign.needs_review && <CampaignReviewPanel campaign={campaign} canReview={Boolean(publishPerm.data)} />}

          <CampaignPageActions
            initialCampaign={campaign}
            initialDeliveries={deliveriesResult?.data ?? []}
            events={eventsResult?.data ?? []}
            adminUsers={usersResult?.data ?? []}
            canEdit={Boolean(editPerm.data)}
            canPublish={Boolean(publishPerm.data)}
            canDelete={Boolean(deletePerm.data)}
          />
        </div>
      </div>
    </PageShell>
  );
}
