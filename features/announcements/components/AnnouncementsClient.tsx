"use client";

import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Announcement } from "@/app/schemas/announcement";
import { reorderAnnouncements } from "../actions";
import { isExpired } from "../announcementUtils";
import { useCan } from "@/store/hooks";
import CarouselPreview from "./CarouselPreview";
import PreviewHeader from "./PreviewHeader";
import AnnouncementTabs, { type AnnouncementTab } from "./AnnouncementTabs";
import InspectorPanel from "./InspectorPanel";

interface AnnouncementsClientProps {
  currentAnnouncements: Announcement[];
  expiredAnnouncements: Announcement[];
  scheduledAnnouncements: Announcement[];
}

export default function AnnouncementsClient({
  currentAnnouncements,
  expiredAnnouncements,
  scheduledAnnouncements,
}: Readonly<AnnouncementsClientProps>) {
  const [reordering, setReordering] = useState(false);
  const reorderingRef = useRef(false);
  const canEdit = useCan("announcements.edit");
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [router]);
  const [liveItems, setLiveItems] = useState(currentAnnouncements);
  const [selected, setSelected] = useState<Announcement | null>(
    currentAnnouncements[0] ?? null,
  );
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<AnnouncementTab>("live");

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!canEdit || reorderingRef.current) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = liveItems.findIndex((a) => a.id === active.id);
      const newIndex = liveItems.findIndex((a) => a.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(liveItems, oldIndex, newIndex);
      setLiveItems(reordered);
      reorderingRef.current = true;
      setReordering(true);
      try {
        const result = await reorderAnnouncements({ ids: reordered.map((a) => a.id) });
        if (!result?.data?.success && !result?.data?.error) throw new Error("Unable to save announcement order.");
        if (result.data?.error) throw new Error(result.data.error);
        toast.success("Announcement order saved.");
      } catch (error) {
        setLiveItems(liveItems);
        toast.error(error instanceof Error ? error.message : "Unable to save announcement order.");
        router.refresh();
      } finally {
        reorderingRef.current = false;
        setReordering(false);
      }
    },
    [canEdit, liveItems, router],
  );

  const itemsByTab = { live: liveItems, scheduled: scheduledAnnouncements, expired: expiredAnnouncements };
  function handleTabChange(newTab: AnnouncementTab) {
    setTab(newTab);
    setSelected(itemsByTab[newTab][0] ?? null);
  }

  const isSelectedExpired = selected ? isExpired(selected) : false;
  // Scheduled and expired items still preview, but arrows/dots
  // only make sense for the live rotation.
  const previewItems = tab === "live" && !isSelectedExpired ? liveItems : [];

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* ── Left: preview + tabs ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-surface border border-line rounded-2xl overflow-hidden">
        {/* Preview header */}
        <PreviewHeader selected={selected} isLive={tab === "live"}
          isMobile={isMobile} onDeviceChange={setIsMobile} />

        {/* Carousel preview */}
        <CarouselPreview
          announcements={previewItems}
          selected={selected}
          isMobile={isMobile}
          onNavigate={setSelected}
        />

        {reordering && <p role="status" className="px-4 py-2 text-sm text-muted">Saving order…</p>}
        <AnnouncementTabs tab={tab} items={itemsByTab} selected={selected} canEdit={canEdit && !reordering}
          onTabChange={handleTabChange} onSelect={setSelected} onDragEnd={handleDragEnd} />
      </div>

      {/* ── Right: inspector ───────────────────────────────────────────── */}
      <div className="w-full lg:w-72 shrink-0">
        <div className="bg-surface border border-line rounded-2xl p-5 sticky top-[73px]">
          <InspectorPanel
            selected={selected}
            liveIds={liveItems.map((a) => a.id)}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
