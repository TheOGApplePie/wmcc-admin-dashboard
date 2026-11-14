"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar, { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import type { SocialCalendarPost } from "@/app/schemas/socialCampaigns";
import { getSocialCalendarPosts } from "@/actions/socialCampaigns";
import { scheduledAtFor } from "@/features/socialCampaigns/scheduling/slots";
import PostStatusBadge from "./PostStatusBadge";
import CalendarSelectionActions from "./CalendarSelectionActions";
import { postStatusLabel } from "../lib/postApproval";
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
  onCopied, campaignStatus = "all",
}: Readonly<{
  deliveries: SocialCalendarPost[];
  campaignStatus?: "all" | "current" | SocialCalendarPost["campaign_status"];
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionBusy, setSelectionBusy] = useState(false);
  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [platform, setPlatform] = useState<"all" | SocialCalendarPost["schedule_platform"]>("all");
  const [postStatus, setPostStatus] = useState<"all" | SocialCalendarPost["status"]>("all");
  const [campaignFilter, setCampaignFilter] = useState<"all" | "other" | "this">("all");
  const firstPreviewDate = previewPosts.map((post) => post.scheduled_date).filter((date): date is string => Boolean(date)).sort()[0];
  useEffect(() => {
    if (firstPreviewDate) controller.gotoDate(firstPreviewDate);
  }, [controller, firstPreviewDate]);
  const previewIds = useMemo(() => new Set(previewPosts.map((post) => post.id)), [previewPosts]);
  const [range, setRange] = useState<{ from: string; through: string } | null>(null);
  const [loadedPosts, setLoadedPosts] = useState<SocialCalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setLoadError(null);
      try {
        const rows: SocialCalendarPost[] = [];
        for (let page = 1; ; page++) {
          const result = await getSocialCalendarPosts({ ...range, page, pageSize: 200, platform, status: postStatus,
            campaignId: campaignId ?? (campaignFilter === "this" ? highlightCampaignId ?? undefined : undefined),
            excludeCampaignId: campaignFilter === "other" ? highlightCampaignId ?? undefined : undefined,
            campaignStatus,
          });
          if (cancelled) return;
          if (!result?.data?.data || result.data.error) throw new Error(result?.data?.error || result?.serverError || "Could not load posts.");
          rows.push(...result.data.data);
          if (!("hasMore" in result.data) || !result.data.hasMore) break;
        }
        setLoadedPosts(rows);
      } catch (error) { if (!cancelled) { setLoadedPosts([]); setLoadError(error instanceof Error ? error.message : "Could not load posts."); } }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [range, platform, postStatus, campaignId, highlightCampaignId, campaignFilter, campaignStatus, deliveries, reload]);
  // Generated previews are a bounded, unsaved form value; their display filters stay local.
  const visible = useMemo(() => loading ? [] : [...loadedPosts, ...previewPosts.filter(post =>
    (platform === "all" || post.schedule_platform === platform) && (postStatus === "all" || post.status === postStatus) &&
    (!range || Boolean(post.scheduled_date && post.scheduled_date >= range.from && post.scheduled_date < range.through)) &&
    campaignFilter !== "other")], [loadedPosts, previewPosts, platform, postStatus, range, campaignFilter, loading]);
  const selectedPosts = visible.filter((post) => selectedIds.has(post.id) && !previewIds.has(post.id) && post.scheduled_date && post.time_slot);
  const events = useMemo(
    () =>
      visible.filter((delivery) => delivery.scheduled_date && delivery.time_slot).map((delivery) => ({
        id: delivery.id,
    title: delivery.post_title,
    start: delivery.scheduled_at ?? scheduledAtFor(delivery.scheduled_date!, delivery.time_slot!),
        extendedProps: { platform: delivery.schedule_platform, campaignId: delivery.campaign_id,
          preview: previewIds.has(delivery.id), status: delivery.status, needsReview: delivery.needs_review, selected: selectedIds.has(delivery.id),
        },
      })),
    [visible, previewIds, selectedIds],
  );
  const buttons = controller.getButtonState();

  return (
    <>
      <section className="min-w-0 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
          <button type="button" onClick={() => { clearSelection(); controller.prev(); }} disabled={selectionBusy || buttons.prev.isDisabled} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">←</button>
          <button type="button" disabled={selectionBusy} onClick={() => { clearSelection(); controller.today(); }} className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">Today</button>
          <button type="button" onClick={() => { clearSelection(); controller.next(); }} disabled={selectionBusy || buttons.next.isDisabled} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">→</button>
        </div>
          <h2 className="text-lg font-semibold text-ink">{controller.view?.title}</h2>
          {highlightCampaignId && (
            <select
              aria-label="Campaign visibility"
              value={campaignFilter}
              disabled={selectionBusy} onChange={(event) => { clearSelection(); setCampaignFilter(event.target.value as typeof campaignFilter); }} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="all">All campaigns</option>
              <option value="other">Other campaigns</option>
              <option value="this">This campaign</option>
            </select>
          )}
          <select
            aria-label="Platform"
            value={platform} disabled={selectionBusy} onChange={(event) => { clearSelection(); setPlatform(event.target.value as typeof platform); }} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
          <option value="all">All platforms</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="tiktok">TikTok</option>
        </select>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          Post status
          <select value={postStatus} disabled={selectionBusy} onChange={(event) => { clearSelection(); setPostStatus(event.target.value as typeof postStatus); }} className="rounded-lg border border-line bg-white px-3 py-2">
            <option value="all">All statuses</option>
            {(["draft", "proposed", "scheduled", "due", "processing", "provider_processing", "sent", "failed", "skipped"] as const).map((status) => <option key={status} value={status}>{postStatusLabel(status)}</option>)}
          </select>
        </label>
        <ul aria-label="Post status badge legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          <li className="flex items-center gap-1.5"><PostStatusBadge status="sent" />Sent</li>
          <li className="flex items-center gap-1.5"><PostStatusBadge status="proposed" />Proposed / needs attention</li>
          <li className="flex items-center gap-1.5"><PostStatusBadge status="draft" />Draft</li>
          <li className="flex items-center gap-1.5"><PostStatusBadge status="scheduled" />Approved / publishing</li>
        </ul>
        </div>
        {previewPosts.length > 0 && (
          <p className="mb-3 text-xs text-muted">
            Unsaved proposals are labelled “Unsaved”. Save the generation to commit them.
          </p>
        )}
        {campaignId && <p className="mb-3 rounded-lg bg-teal-soft px-3 py-2 text-xs font-medium text-teal-dark">Showing only the selected campaign.</p>}
        {(canEdit || canDelete) && <p className="mb-3 text-xs text-muted">Click a post to edit. Ctrl-click or Cmd-click to select multiple posts.</p>}
        {selectedPosts.length > 0 && <CalendarSelectionActions
          posts={selectedPosts} canEdit={canEdit} canPublish={canPublish} canDelete={canDelete}
          onOpen={onEditDelivery} onClear={clearSelection} onBusyChange={setSelectionBusy}
          onRefreshed={(posts) => {
            setReload(value => value + 1);
            if (onCopied) onCopied(posts);
          }}
        />}
        {loading && <p role="status" className="mb-3 text-sm text-muted">Loading posts…</p>}
        {loadError && <p role="alert" className="mb-3 text-sm text-coral">{loadError} <button onClick={() => setReload(value => value + 1)}>Retry</button></p>}
        <FullCalendar datesSet={({ start, end }) => {
          const from = start.toISOString().slice(0, 10), through = end.toISOString().slice(0, 10);
          setRange(current => current?.from === from && current.through === through ? current : { from, through });
          clearSelection();
        }} controller={controller} plugins={[themePlugin, dayGridPlugin, interactionPlugin]} initialView="dayGridMonth" timeZone="America/Toronto" fixedWeekCount={false}
          dayMaxEvents={6}
          events={events}
          eventDisplay="block"
          dayCellTopInnerClass={(info) => (info.isToday ? styles.today : "")}
        dateClick={(info) => { if (!selectionBusy) onDateSelect?.(info.dateStr); }}
          eventClick={(info) => {
            if (selectionBusy || previewIds.has(info.event.id) || (!canEdit && !canDelete)) return;
            const delivery = loadedPosts.find((item) => item.id === info.event.id);
            if (!delivery) return;
            if (info.jsEvent.ctrlKey || info.jsEvent.metaKey) {
              info.jsEvent.preventDefault();
              toggleSelection(delivery.id);
            } else onEditDelivery(delivery);
          }}
          eventContent={(info) => {
          const key = info.event.extendedProps.platform as keyof typeof PLATFORM;
          const selected = Boolean(info.event.extendedProps.selected);
          const selectable = !info.event.extendedProps.preview && (canEdit || canDelete);
            return (
              <div
                role={selectable ? "button" : undefined}
                tabIndex={selectable ? 0 : undefined}
                aria-pressed={selectable ? selected : undefined}
                aria-label={`${selected ? "Selected: " : ""}${info.event.title}, ${postStatusLabel(info.event.extendedProps.status as SocialCalendarPost["status"])}`}
                onKeyDown={(event) => {
                  if (!selectable || selectionBusy || !["Enter", " "].includes(event.key)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.ctrlKey || event.metaKey) toggleSelection(info.event.id);
                  else {
                    const post = loadedPosts.find((item) => item.id === info.event.id);
                    if (post) onEditDelivery(post);
                  }
                }}
                className={`relative w-full overflow-visible rounded-md py-1 pl-2 pr-5 text-[11px] font-semibold ${selected ? "ring-2 ring-ink ring-inset" : highlightCampaignId === info.event.extendedProps.campaignId ? "ring-2 ring-teal ring-offset-1" : ""}`}
                style={{ backgroundColor: PLATFORM[key].soft, color: PLATFORM[key].color,
                  opacity: !selected && highlightCampaignId && campaignFilter === "all" &&
                    highlightCampaignId !== info.event.extendedProps.campaignId ? 0.35 : 1,
                }}
              >
                <span className="block overflow-hidden">
                  {selected && <span aria-hidden="true" className="mr-1">✓</span>}
                  <span className="mr-1 opacity-75">{info.timeText}</span>
                  {info.event.extendedProps.preview && <span className="mr-1">Unsaved ·</span>}
                  {info.event.title}
                </span>
                <PostStatusBadge
                  status={info.event.extendedProps.status as SocialCalendarPost["status"]}
                  needsReview={Boolean(info.event.extendedProps.needsReview)}
                  className="absolute right-1 top-1 z-10"
                />
              </div>
            );
          }}
        eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
        />
        {!canEdit && <p className="mt-3 text-xs text-muted">You need social edit permission to modify post content.</p>}
      </section>
      {editingDelivery && (
        <ManualPostModal key={editingDelivery.id} delivery={editingDelivery} initialCampaignId={editingDelivery.campaign_id} initialDate={editingDelivery.scheduled_date}
          canEdit={canEdit} canPublish={canPublish} canDelete={canDelete} onClose={onCloseEditor} onUpdated={(post) => { setReload(value => value + 1); onUpdated(post); }}
          onCopied={(posts) => { setReload(value => value + 1); const changed = new Map(posts.map(post => [post.id, post])); onCopied?.(deliveries.map(post => changed.get(post.id) ?? post)); }} onDeleted={(id) => { setReload(value => value + 1); onDeleted(id); }}
        />
      )}
    </>
  );
}
