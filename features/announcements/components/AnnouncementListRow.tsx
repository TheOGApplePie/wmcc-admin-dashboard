"use client";

import type { Announcement } from "@/app/schemas/announcement";
import AnnouncementImage from "@/features/announcements/components/AnnouncementImage";
import { isScheduled, formatAnnouncementDate } from "../announcementUtils";

export default function AnnouncementListRow({
  announcement,
  selected,
  onSelect,
}: Readonly<{
  announcement: Announcement;
  selected: boolean;
  onSelect: () => void;
}>) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border-2 transition-all ${
        selected
          ? "border-teal bg-teal-soft"
          : "border-transparent hover:bg-canvas"
      }`}
    >
      {announcement.poster_url ? (
        <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-line">
          <AnnouncementImage
            src={announcement.poster_url}
            alt=""
            fill
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="announcement-slide-bg w-10 h-10 rounded-lg shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-ink truncate">
          {announcement.title}
        </p>
        <p className="text-[11px] text-muted">
          {isScheduled(announcement) && announcement.publish_at
            ? `Goes live ${formatAnnouncementDate(announcement.publish_at)}`
            : `Expired ${formatAnnouncementDate(announcement.expires_at)}`}
        </p>
      </div>
    </button>
  );
}
