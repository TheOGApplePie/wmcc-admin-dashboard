import type { Announcement } from "@/app/schemas/announcement";
import { isExpired, isScheduled } from "../announcementUtils";

function statusAppearance(announcement: Announcement) {
  if (isScheduled(announcement)) return { label: "Scheduled", background: "#FEF3C7", color: "#92400E", dot: "#92400E" };
  if (isExpired(announcement)) return { label: "Expired", background: "#FEE2E2", color: "#B91C1C", dot: "#B91C1C" };
  return { label: "Live", background: "#CCFBF1", color: "#065F46", dot: "#0F8073" };
}

export default function AnnouncementStatusBadge({ announcement }: Readonly<{ announcement: Announcement }>) {
  const status = statusAppearance(announcement);
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
    style={{ backgroundColor: status.background, color: status.color }}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.dot }} />
    {status.label}
  </span>;
}
