"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminUserOption, CampaignEventOption, SocialCalendarDelivery, SocialCampaign } from "@/app/schemas/socialCampaigns";
import CampaignScheduleModal from "./CampaignScheduleModal";
import CampaignSettingsForm from "./CampaignSettingsModal";

export default function CampaignPageActions({ initialCampaign, initialDeliveries, events, adminUsers, canEdit, canSchedule, canSend, canDelete }: Readonly<{
  initialCampaign: SocialCampaign; initialDeliveries: SocialCalendarDelivery[];
  events: CampaignEventOption[]; adminUsers: AdminUserOption[];
  canEdit: boolean; canSchedule: boolean; canSend: boolean; canDelete: boolean;
}>) {
  const router = useRouter();
  const [campaign, setCampaign] = useState(initialCampaign);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return <>
    <div className="mb-5 flex justify-end">
      {(canSchedule || campaign.needs_review) && <button type="button" onClick={() => setScheduleOpen(true)} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white">{campaign.needs_review ? "Review schedule" : campaign.generated_through ? "Review / extend schedule" : "Generate / review schedule"}</button>}
    </div>
    <CampaignSettingsForm campaign={campaign} events={events} adminUsers={adminUsers} canEdit={canEdit} canSchedule={canSchedule} onSaved={(updated) => { setCampaign(updated); router.refresh(); }} />
    {scheduleOpen && <CampaignScheduleModal campaign={campaign} deliveries={deliveries} canEdit={canEdit} canSchedule={canSchedule} canSend={canSend} canDelete={canDelete} onClose={() => { setScheduleOpen(false); router.refresh(); }} onDeliveriesChanged={setDeliveries} />}
  </>;
}
