"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar, { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import type { SocialCalendarPost } from "@/app/schemas/socialCampaigns";
import { scheduledAtFor } from "@/features/socialCampaigns/scheduling/slots";
import ManualPostModal from "./ManualPostModal";
import styles from "../../../app/components/EventsCalendar.module.css";

export const PLATFORM = {
  instagram: { label: "Instagram", color: "#c13584", soft: "#fce7f3" },
  whatsapp: { label: "WhatsApp", color: "#168f55", soft: "#dcfce7" },
  tiktok: { label: "TikTok", color: "#111827", soft: "#e5e7eb" },
} as const;

export const CHANNEL_LABEL: Record<SocialCalendarPost["channel"], string> = {
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

export default function SocialPostsCalendar({
  deliveries,
  previewPosts = [],
  campaignId,
  canEdit,
  canPublish,
  canDelete,
  onUpdated,
  onDeleted,
  editingDelivery,
  onEditDelivery,
  onCloseEditor, highlightCampaignId = null,
  onDateSelect,
  onCopied,
}: Readonly<{
  deliveries: SocialCalendarPost[];
  previewPosts?: SocialCalendarPost[]; campaignId: string | null;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
  onUpdated: (delivery: SocialCalendarPost) => void; onDeleted: (id: string) => void;
  editingDelivery: SocialCalendarPost | null; onEditDelivery: (delivery: SocialCalendarPost) => void; onCloseEditor: () => void;
  highlightCampaignId?: string | null; onDateSelect?: (date: string) => void;
  onCopied?: (posts: SocialCalendarPost[]) => void;
}>) {
  const controller = useCalendarController();
  const [platform, setPlatform] = useState<"all" | SocialCalendarPost["schedule_platform"]>("all");
  const [campaignFilter, setCampaignFilter] = useState<"all" | "other" | "this">("all");
  const firstPreviewDate = previewPosts.map((post) => post.scheduled_date).filter((date): date is string => Boolean(date)).sort()[0];
  useEffect(() => {
    if (firstPreviewDate) controller.gotoDate(firstPreviewDate);
  }, [controller, firstPreviewDate]);
  const previewIds = useMemo(() => new Set(previewPosts.map((post) => post.id)), [previewPosts]);
  const visible = useMemo(
    () =>
      [...deliveries, ...previewPosts].filter(
        (delivery) =>
    Boolean(delivery.scheduled_date && delivery.time_slot) &&
    (!campaignId || delivery.campaign_id === campaignId) &&
          (!highlightCampaignId || campaignFilter === "all" ||
            (campaignFilter === "this"
              ? delivery.campaign_id === highlightCampaignId
              : delivery.campaign_id !== highlightCampaignId)) &&
    (platform === "all" || delivery.schedule_platform === platform) &&
    delivery.status !== "cancelled",
      ),
    [campaignId, deliveries, previewPosts, platform, highlightCampaignId, campaignFilter],
  );
  const events = useMemo(
    () =>
      visible.map((delivery) => ({
        id: delivery.id,
    title: delivery.post_title,
    start: delivery.scheduled_at ?? scheduledAtFor(delivery.scheduled_date!, delivery.time_slot!),
        extendedProps: { platform: delivery.schedule_platform, campaignId: delivery.campaign_id,
          preview: previewIds.has(delivery.id),
        },
      })),
    [visible, previewIds],
  );
  const buttons = controller.getButtonState();

  return (
    <>
      <section className="min-w-0 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
          <button type="button" onClick={() => controller.prev()} disabled={buttons.prev.isDisabled} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">←</button>
          <button type="button" onClick={() => controller.today()} className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">Today</button>
          <button type="button" onClick={() => controller.next()} disabled={buttons.next.isDisabled} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">→</button>
        </div>
          <h2 className="text-lg font-semibold text-ink">{controller.view?.title}</h2>
          {highlightCampaignId && (
            <select
              aria-label="Campaign visibility"
              value={campaignFilter}
              onChange={(event) => setCampaignFilter(event.target.value as typeof campaignFilter)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="all">All campaigns</option>
              <option value="other">Other campaigns</option>
              <option value="this">This campaign</option>
            </select>
          )}
          <select
            aria-label="Platform"
            value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
          <option value="all">All platforms</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="tiktok">TikTok</option>
        </select>
        </div>
        {previewPosts.length > 0 && (
          <p className="mb-3 text-xs text-muted">
            Unsaved proposals are labelled “Unsaved”. Save the generation to commit them.
          </p>
        )}
        {campaignId && <p className="mb-3 rounded-lg bg-teal-soft px-3 py-2 text-xs font-medium text-teal-dark">Showing only the selected campaign.</p>}
        <FullCalendar controller={controller} plugins={[themePlugin, dayGridPlugin, interactionPlugin]} initialView="dayGridMonth" timeZone="America/Toronto" fixedWeekCount={false}
          dayMaxEvents={6}
          events={events}
          eventDisplay="block"
          dayCellTopInnerClass={(info) => (info.isToday ? styles.today : "")}
        dateClick={(info) => onDateSelect?.(info.dateStr)}
          eventClick={(info) => {
            if (previewIds.has(info.event.id)) return; const delivery = deliveries.find((item) => item.id === info.event.id); if (delivery && (canEdit || canDelete)) onEditDelivery(delivery);
          }}
          eventContent={(info) => {
          const key = info.event.extendedProps.platform as keyof typeof PLATFORM;
            return (
              <div className={`w-full overflow-hidden rounded-full px-2 py-1 text-[11px] font-semibold ${highlightCampaignId === info.event.extendedProps.campaignId ? "ring-2 ring-teal ring-offset-1" : ""}`}
                style={{ backgroundColor: PLATFORM[key].soft, color: PLATFORM[key].color,
                  opacity: highlightCampaignId && campaignFilter === "all" &&
                    highlightCampaignId !== info.event.extendedProps.campaignId ? 0.35 : 1,
                }}
              >
                <span className="mr-1 opacity-75">{info.timeText}</span>
                { info.event.extendedProps.preview && <span className="mr-1">Unsaved ·</span>}
                {info.event.title}
              </div>
            );
          }}
        eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
        />
        {!canEdit && <p className="mt-3 text-xs text-muted">You need social edit permission to modify post content.</p>}
      </section>
      {editingDelivery && (
        <ManualPostModal key={editingDelivery.id} delivery={editingDelivery} initialCampaignId={editingDelivery.campaign_id} initialDate={editingDelivery.scheduled_date}
          canEdit={canEdit} canPublish={canPublish} canDelete={canDelete} onClose={onCloseEditor} onUpdated={onUpdated}
          onCopied={onCopied} onDeleted={onDeleted}
        />
      )}
    </>
  );
}
