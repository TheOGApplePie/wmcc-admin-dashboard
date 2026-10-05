"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserOption, CampaignEventOption, SocialCalendarPost, SocialCampaign } from "@/app/schemas/socialCampaigns";
import CampaignScheduleModal from "./CampaignScheduleModal";
import CampaignSettingsForm from "./CampaignSettingsModal";

export default function CampaignPageActions({ initialCampaign, initialDeliveries, events, adminUsers, canEdit, canPublish, canDelete }: Readonly<{
  initialCampaign: SocialCampaign; initialDeliveries: SocialCalendarPost[];
  events: CampaignEventOption[]; adminUsers: AdminUserOption[];
  canEdit: boolean; canPublish: boolean; canDelete: boolean;
}>) {
  const router = useRouter();
  const [campaign, setCampaign] = useState(initialCampaign);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return <>
    <div className="mb-5 flex justify-end">
      {(canPublish || campaign.needs_review) && <button type="button" onClick={() => setScheduleOpen(true)} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white">{campaign.needs_review ? "Review schedule" : campaign.generated_through ? "Review / extend schedule" : "Generate / review schedule"}</button>}
    </div>
    <CampaignSettingsForm campaign={campaign} events={events} adminUsers={adminUsers} canEdit={canEdit} canPublish={canPublish} onSaved={(updated) => { setCampaign(updated); router.refresh(); }} />
    {scheduleOpen && <CampaignScheduleModal campaign={campaign} deliveries={deliveries} canEdit={canEdit} canPublish={canPublish} canDelete={canDelete} onClose={() => { setScheduleOpen(false); router.refresh(); }} onDeliveriesChanged={setDeliveries} />}
  </>;
}
