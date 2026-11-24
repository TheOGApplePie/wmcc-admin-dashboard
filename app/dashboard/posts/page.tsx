import { getCampaignEventOptions, getSocialAdminUsers, getSocialCampaigns } from "@/actions/socialCampaigns";
import { PageShell } from "@/app/components/ui/PageShell";
import CampaignsClient from "@/features/socialCampaigns/components/CampaignsClient";
import { requirePermission } from "@/utils/permissions";
import { requireViewerPermission } from "@/features/access/server";

export const dynamic = "force-dynamic";

export default async function SocialCampaignsPage({ searchParams }: Readonly<{ searchParams: Promise<{ status?: string; page?: string }> }>) {
  const params = await searchParams;
  const status = (["all", "current", "draft", "active", "paused", "completed", "archived"] as const).find(value => value === params.status) ?? "current";
  const page = Math.min(100000, Math.max(1, Math.floor(Number(params.page) || 1)));
  await requireViewerPermission("social", "view");
  const { supabase } = await requirePermission("social", "view");
  const [{ data: campaignResult }, { data: eventResult }, { data: userResult }, editPerm, publishPerm, deletePerm] = await Promise.all([
    getSocialCampaigns({ status, page }),
    getCampaignEventOptions({}),
    getSocialAdminUsers(),
    supabase.rpc("has_perm", { p_module: "social", p_action: "edit" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "publish" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "delete" }),
  ]);

  if (!campaignResult || campaignResult.error) throw new Error(campaignResult?.error || "Could not load campaigns.");
  if (editPerm.data && (eventResult?.error || userResult?.error)) throw new Error(eventResult?.error || userResult?.error || "Could not load form options.");

  return (
    <PageShell title="Social Campaigns" subtitle="Plan and coordinate Instagram, WhatsApp, and TikTok content" noPad>
      <CampaignsClient
        key={`${status}:${page}`}
        statusFilter={status} page={page} total={campaignResult && "total" in campaignResult ? campaignResult.total : 0}
        initialCampaigns={campaignResult?.data ?? []}
        calendarDeliveries={[]}
        events={eventResult?.data ?? []}
        adminUsers={userResult?.data ?? []}
        canEdit={Boolean(editPerm.data)}
        canPublish={Boolean(publishPerm.data)}
        canDelete={Boolean(deletePerm.data)}
      />
    </PageShell>
  );
}
