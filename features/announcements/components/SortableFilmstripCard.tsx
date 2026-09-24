"use client";

import type { Announcement } from "@/app/schemas/announcement";
import AnnouncementImage from "@/features/announcements/components/AnnouncementImage";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function SortableFilmstripCard({ announcement, index, selected, onSelect, canEdit }: Readonly<{
  announcement: Announcement;
  index: number;
  selected: boolean;
  onSelect: () => void;
  canEdit: boolean;
}>) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: announcement.id, disabled: !canEdit });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }}
      className={`relative shrink-0 flex flex-col gap-1.5 w-[136px] rounded-xl p-2.5 border-2 transition-all ${selected ? "border-teal bg-teal-soft shadow-sm" : "border-line bg-canvas hover:border-teal/40"}`}>
      <button type="button" onClick={onSelect} aria-pressed={selected}
        aria-label={`Preview ${announcement.title}`} className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-teal" />
      {canEdit && <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners}
        aria-label={`Reorder ${announcement.title}`} className="absolute right-2 top-2 z-20 rounded bg-surface px-1 cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-teal">↔</button>}
      <div className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white z-10 pointer-events-none"
        style={{ backgroundColor: selected ? "#0F8073" : "#15201C" }}>{index + 1}</div>
      {announcement.poster_url ? (
        <div className="relative w-full rounded-lg overflow-hidden" style={{ aspectRatio: "3/2" }}>
          <AnnouncementImage src={announcement.poster_url} alt={announcement.poster_alt || announcement.title} fill className="object-cover" />
        </div>
      ) : (
        <div className="announcement-slide-bg w-full rounded-lg flex items-center justify-center" style={{ aspectRatio: "3/2" }}>
          <span className="text-[10px] text-white/40 font-medium">No poster</span>
        </div>
      )}
      <p className="text-[11px] font-semibold leading-tight line-clamp-2 text-ink">{announcement.title}</p>
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#0F8073" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#0F8073" }} />Live
      </span>
    </div>
  );
}
