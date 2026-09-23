import { getCampaignEventOptions, getSocialAdminUsers, getSocialCalendarDeliveries, getSocialCampaigns } from "@/actions/socialCampaigns";
import { PageShell } from "@/app/components/ui/PageShell";
import CampaignsClient from "@/features/socialCampaigns/components/CampaignsClient";
import { requirePermission } from "@/utils/permissions";

export const dynamic = "force-dynamic";

export default async function SocialCampaignsPage() {
  const { supabase } = await requirePermission("social", "view");
  const [{ data: campaignResult }, { data: calendarResult }, { data: eventResult }, { data: userResult }, editPerm, schedulePerm, sendPerm, deletePerm] = await Promise.all([
    getSocialCampaigns(),
    getSocialCalendarDeliveries(),
    getCampaignEventOptions(),
    getSocialAdminUsers(),
    supabase.rpc("has_perm", { p_module: "social", p_action: "edit" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "schedule" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "send" }),
    supabase.rpc("has_perm", { p_module: "social", p_action: "delete" }),
  ]);

  if (campaignResult?.error) throw new Error(campaignResult.error);
  if (calendarResult?.error) throw new Error(calendarResult.error);

  return (
    <PageShell title="Social Campaigns" subtitle="Plan and coordinate Instagram, WhatsApp, and TikTok content" noPad>
      <CampaignsClient
        initialCampaigns={campaignResult?.data ?? []}
        calendarDeliveries={calendarResult?.data ?? []}
        events={eventResult?.data ?? []}
        adminUsers={userResult?.data ?? []}
        canEdit={Boolean(editPerm.data)}
        canSchedule={Boolean(schedulePerm.data)}
        canSend={Boolean(sendPerm.data)}
        canDelete={Boolean(deletePerm.data)}
      />
    </PageShell>
  );
}
