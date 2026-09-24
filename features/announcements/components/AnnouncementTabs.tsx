"use client";

import type { Announcement } from "@/app/schemas/announcement";
import type { DragEndEvent } from "@dnd-kit/core";
import LiveAnnouncementList from "./LiveAnnouncementList";
import AnnouncementListRow from "./AnnouncementListRow";

const TAB_LABELS = { live: "Live rotation", scheduled: "Scheduled", expired: "Expired" };
export type AnnouncementTab = keyof typeof TAB_LABELS;
const LIST_HINTS = {
  scheduled: "Announcements go live automatically at their scheduled time. Edit to change the schedule.",
  expired: "Announcements auto-archive when their end date passes. Restore one to push it back into the live rotation.",
};

function AnnouncementList({ tab, items, selected, onSelect }: Readonly<{
  tab: "scheduled" | "expired";
  items: Announcement[];
  selected: Announcement | null;
  onSelect: (announcement: Announcement) => void;
}>) {
  return <>
    <p className="text-[11px] text-muted mb-3">{LIST_HINTS[tab]}</p>
    {items.length === 0 && <p className="text-[13px] text-muted py-3">No {tab} announcements.</p>}
    <div className="flex flex-col gap-1">
      {items.map((announcement) => <AnnouncementListRow key={announcement.id}
        announcement={announcement} selected={selected?.id === announcement.id}
        onSelect={() => onSelect(announcement)} />)}
    </div>
  </>;
}

export default function AnnouncementTabs({ tab, items, selected, canEdit, onTabChange, onSelect, onDragEnd }: Readonly<{
  tab: AnnouncementTab;
  items: Record<AnnouncementTab, Announcement[]>;
  selected: Announcement | null;
  canEdit: boolean;
  onTabChange: (tab: AnnouncementTab) => void;
  onSelect: (announcement: Announcement) => void;
  onDragEnd: (event: DragEndEvent) => void;
}>) {
  return <div className="border-t border-line">
    <div className="flex">
      {(Object.keys(TAB_LABELS) as AnnouncementTab[]).map((key) => (
        <button type="button" key={key} aria-pressed={tab === key} onClick={() => onTabChange(key)}
          className={`flex-1 px-5 py-3 text-[12px] font-semibold transition-colors ${tab === key ? "text-ink border-b-2 border-teal -mb-px" : "text-muted hover:text-ink"}`}>
          {TAB_LABELS[key]}
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]" style={{
            backgroundColor: tab === key && key === "live" ? "#D1FAE5" : "#F6F4EF",
            color: tab === key && key === "live" ? "#065F46" : "#6B726E",
          }}>{items[key].length}</span>
        </button>
      ))}
    </div>
    <div className="px-4 pt-3 pb-4">
      {tab === "live" ? <LiveAnnouncementList liveItems={items.live} selected={selected}
        canEdit={canEdit} onSelect={onSelect} onDragEnd={onDragEnd} />
        : <AnnouncementList tab={tab} items={items[tab]} selected={selected} onSelect={onSelect} />}
    </div>
  </div>;
}
