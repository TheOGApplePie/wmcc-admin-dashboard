"use client";

import { useMemo, useState } from "react";
import FullCalendar, { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import type { SocialCalendarDelivery } from "@/app/schemas/socialCampaigns";
import { scheduledAtFor } from "@/features/socialCampaigns/scheduling/slots";
import ManualPostModal from "./ManualPostModal";

export const PLATFORM = {
  instagram: { label: "Instagram", color: "#c13584", soft: "#fce7f3" },
  whatsapp: { label: "WhatsApp", color: "#168f55", soft: "#dcfce7" },
  tiktok: { label: "TikTok", color: "#111827", soft: "#e5e7eb" },
} as const;

export const CHANNEL_LABEL: Record<SocialCalendarDelivery["channel"], string> = {
  instagram_feed: "Instagram Feed",
  instagram_story: "Instagram Story",
  instagram_reel: "Instagram Reel",
  whatsapp: "WhatsApp",
  tiktok_reel: "TikTok Reel",
};

export const SLOT_LABEL = {
  morning: "9 AM EST / 10 AM EDT",
  afternoon: "2 PM EST / 3 PM EDT",
  evening: "7 PM EST / 8 PM EDT",
} as const;

export default function SocialPostsCalendar({ deliveries, campaignId, canEdit, canSchedule, canSend, canDelete, onUpdated, onDeleted, editingDelivery, onEditDelivery, onCloseEditor, highlightCampaignId = null, onDateSelect }: Readonly<{
  deliveries: SocialCalendarDelivery[]; campaignId: string | null; canEdit: boolean; canSchedule: boolean; canSend: boolean; canDelete: boolean;
  onUpdated: (delivery: SocialCalendarDelivery) => void; onDeleted: (id: string) => void;
  editingDelivery: SocialCalendarDelivery | null; onEditDelivery: (delivery: SocialCalendarDelivery) => void; onCloseEditor: () => void;
  highlightCampaignId?: string | null; onDateSelect?: (date: string) => void;
}>) {
  const controller = useCalendarController();
  const [platform, setPlatform] = useState<"all" | SocialCalendarDelivery["schedule_platform"]>("all");
  const visible = useMemo(() => deliveries.filter((delivery) =>
    Boolean(delivery.scheduled_date && delivery.time_slot) &&
    (!campaignId || delivery.campaign_id === campaignId) &&
    (platform === "all" || delivery.schedule_platform === platform) &&
    delivery.status !== "cancelled",
  ), [campaignId, deliveries, platform]);
  const events = useMemo(() => visible.map((delivery) => ({
    id: delivery.id,
    title: delivery.post_title,
    start: delivery.scheduled_at ?? scheduledAtFor(delivery.scheduled_date!, delivery.time_slot!),
    extendedProps: { platform: delivery.schedule_platform, campaignId: delivery.campaign_id },
  })), [visible]);
  const buttons = controller.getButtonState();

  return <>
    <section className="min-w-0 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => controller.prev()} disabled={buttons.prev.isDisabled} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">←</button>
          <button type="button" onClick={() => controller.today()} className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">Today</button>
          <button type="button" onClick={() => controller.next()} disabled={buttons.next.isDisabled} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">→</button>
        </div>
        <h2 className="text-lg font-semibold text-ink">{controller.view?.title}</h2>
        <select value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
          <option value="all">All platforms</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="tiktok">TikTok</option>
        </select>
      </div>
      {campaignId && <p className="mb-3 rounded-lg bg-teal-soft px-3 py-2 text-xs font-medium text-teal-dark">Showing only the selected campaign.</p>}
      <FullCalendar controller={controller} plugins={[themePlugin, dayGridPlugin, interactionPlugin]} initialView="dayGridMonth" timeZone="America/Toronto" fixedWeekCount={false} dayMaxEvents={6} events={events} eventDisplay="block"
        dateClick={(info) => onDateSelect?.(info.dateStr)}
        eventClick={(info) => { const delivery = deliveries.find((item) => item.id === info.event.id); if (delivery && (canEdit || canDelete)) onEditDelivery(delivery); }}
        eventContent={(info) => {
          const key = info.event.extendedProps.platform as keyof typeof PLATFORM;
          return <div className={`w-full overflow-hidden rounded-full px-2 py-1 text-[11px] font-semibold ${highlightCampaignId === info.event.extendedProps.campaignId ? "ring-2 ring-teal ring-offset-1" : ""}`} style={{ backgroundColor: PLATFORM[key].soft, color: PLATFORM[key].color }}><span className="mr-1 opacity-75">{info.timeText}</span>{info.event.title}</div>;
        }}
        eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }} />
      {!canEdit && <p className="mt-3 text-xs text-muted">You need social edit permission to modify post content.</p>}
    </section>
    {editingDelivery && <ManualPostModal key={editingDelivery.id} delivery={editingDelivery} initialCampaignId={editingDelivery.campaign_id} initialDate={editingDelivery.scheduled_date} canEdit={canEdit} canSchedule={canSchedule} canSend={canSend} canDelete={canDelete} onClose={onCloseEditor} onUpdated={onUpdated} onDeleted={onDeleted} />}
  </>;
}
