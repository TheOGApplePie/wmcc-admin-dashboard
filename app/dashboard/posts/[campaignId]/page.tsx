import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignEventOptions, getSocialAdminUsers, getSocialCalendarDeliveries, getSocialCampaign } from "@/actions/socialCampaigns";
import { PageShell } from "@/app/components/ui/PageShell";
import CampaignLifecycleControls from "@/features/socialCampaigns/components/CampaignLifecycleControls";
import CampaignPageActions from "@/features/socialCampaigns/components/CampaignPageActions";
import CampaignReviewPanel from "@/features/socialCampaigns/components/CampaignReviewPanel";
import type { SocialCampaignReview } from "@/app/schemas/socialCampaigns";
import { requirePermission } from "@/utils/permissions";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: Readonly<{ params: Promise<{ campaignId: string }> }>) {
  const { campaignId } = await params;
  const { supabase } = await requirePermission("social", "view");
  const [{ data: result }, { data: deliveriesResult }, { data: eventsResult }, { data: usersResult }, editPerm, schedulePerm, sendPerm, deletePerm, reviewPerm] = await Promise.all([
    getSocialCampaign({ id: campaignId }),
    getSocialCalendarDeliveries(),
    getCampaignEventOptions(),
    getSocialAdminUsers(),
    supabase.rpc("has_perm", { p_module: "social", p_action: "edit" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "schedule" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "send" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "delete" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "review" }),
  ]);
  if (result?.error || !result?.data) notFound();
  const campaign = result.data;

  return (
    <PageShell title={campaign.name} subtitle={campaign.events?.title ?? "Standalone campaign"} noPad>
      <div className="min-h-[calc(100dvh-4.5rem)] bg-canvas p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/dashboard/posts" className="text-sm font-semibold text-teal">← All campaigns</Link>
            <CampaignLifecycleControls id={campaign.id} status={campaign.status} canSchedule={Boolean(schedulePerm.data)} canDelete={Boolean(deletePerm.data)} />
          </div>

          {campaign.needs_review && campaign.social_campaign_reviews?.find((review: SocialCampaignReview) => review.status === "open") && <CampaignReviewPanel review={campaign.social_campaign_reviews.find((review: SocialCampaignReview) => review.status === "open") as SocialCampaignReview} canReview={Boolean(reviewPerm.data)} />}

          <CampaignPageActions initialCampaign={campaign} initialDeliveries={deliveriesResult?.data ?? []} events={eventsResult?.data ?? []} adminUsers={usersResult?.data ?? []} canEdit={Boolean(editPerm.data)} canSchedule={Boolean(schedulePerm.data)} canSend={Boolean(sendPerm.data)} canDelete={Boolean(deletePerm.data)} />
        </div>
      </div>
    </PageShell>
  );
}
