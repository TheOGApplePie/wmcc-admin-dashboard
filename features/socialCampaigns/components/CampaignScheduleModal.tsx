"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { generateCampaignProposal, getSocialCalendarDeliveries } from "@/actions/socialCampaigns";
import type { SocialCalendarDelivery, SocialCampaign } from "@/app/schemas/socialCampaigns";
import SocialPostsCalendar from "./SocialPostsCalendar";

export default function CampaignScheduleModal({ campaign, deliveries, canEdit, canSchedule, canSend, canDelete, onClose, onDeliveriesChanged }: Readonly<{
  campaign: SocialCampaign; deliveries: SocialCalendarDelivery[]; canEdit: boolean; canSchedule: boolean;
  canSend: boolean; canDelete: boolean; onClose: () => void;
  onDeliveriesChanged: (deliveries: SocialCalendarDelivery[]) => void;
}>) {
  const [working, setWorking] = useState(false);
  const [launchBehavior, setLaunchBehavior] = useState<"next" | "reminders_only">("next");
  const [editingDelivery, setEditingDelivery] = useState<SocialCalendarDelivery | null>(null);
  const needsLaunchDecision = Boolean(campaign.events?.is_recurring && !campaign.launch_decision_made);
  const campaignPosts = deliveries.filter((delivery) => delivery.campaign_id === campaign.id);
  const generate = async () => {
    setWorking(true);
    const result = await generateCampaignProposal({ id: campaign.id, ...(needsLaunchDecision ? { launch_behavior: launchBehavior } : {}) });
    if (result?.data?.error) { setWorking(false); return toast.error(result.data.error); }
    const refreshed = await getSocialCalendarDeliveries();
    setWorking(false);
    if (refreshed?.data?.error) return toast.error(refreshed.data.error);
    onDeliveriesChanged(refreshed?.data?.data ?? deliveries);
    const inserted = result?.data?.data?.inserted ?? 0;
    toast.success(inserted ? `${inserted} proposal${inserted === 1 ? "" : "s"} created.` : "Campaign coverage is already up to date.");
  };

  return <div className="fixed inset-0 z-40 overflow-y-auto bg-black/50 p-3 md:p-6" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="schedule-review-title" className="mx-auto min-h-[calc(100dvh-3rem)] max-w-[1600px] rounded-2xl bg-canvas p-4 shadow-xl md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 id="schedule-review-title" className="text-xl font-semibold text-ink">Generate and review schedule</h2><p className="text-sm text-muted">{campaign.name} · highlighted posts belong to this campaign. Other posts remain visible so occupied slots are clear.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted">Close</button></div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="mr-auto"><p className="text-sm font-semibold text-ink">{campaign.generated_through ? `Generated through ${campaign.generated_through}` : "No schedule generated yet"}</p><p className="text-xs text-muted">{campaignPosts.length} platform post{campaignPosts.length === 1 ? "" : "s"} currently visible for this campaign.</p></div>
        {needsLaunchDecision && <label className="flex flex-col gap-1 text-xs font-semibold text-ink">Next recurring occurrence<select value={launchBehavior} onChange={(event) => setLaunchBehavior(event.target.value as typeof launchBehavior)} className="rounded-lg border border-line bg-white px-3 py-2 font-normal"><option value="next">Treat as launch occurrence</option><option value="reminders_only">Reminders only</option></select></label>}
        {canSchedule && campaign.event_id && campaign.generation_enabled && <button type="button" disabled={working} onClick={generate} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{working ? "Generating…" : campaign.generated_through ? "Extend schedule" : "Generate initial schedule"}</button>}
      </div>
      <SocialPostsCalendar deliveries={deliveries} campaignId={null} highlightCampaignId={campaign.id} canEdit={canEdit} canSchedule={canSchedule} canSend={canSend} canDelete={canDelete} onUpdated={(updated) => onDeliveriesChanged(deliveries.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => onDeliveriesChanged(deliveries.filter((item) => item.id !== id))} editingDelivery={editingDelivery} onEditDelivery={setEditingDelivery} onCloseEditor={() => setEditingDelivery(null)} />
    </section>
  </div>;
}
