import { AnnouncementPage } from "@/features/announcements";
import { fetchAnnouncements } from "../../../features/announcements/actions";
import type { Announcement } from "@/app/schemas/announcement";
import { requireViewerPermission } from "@/features/access/server";

import { isScheduled } from "@/features/announcements/announcementUtils";

export default async function Announcements() {
  await requireViewerPermission("announcements", "view");
  const result = await fetchAnnouncements();
  if (!result?.data || result.serverError) {
    throw new Error("Unable to load announcements. Please try again.");
  }
  const announcements: Announcement[] = result.data;
  const now = new Date();
  const currentAnnouncements = announcements.filter((a) => !isScheduled(a, now) && new Date(a.expires_at) > now);
  const expiredAnnouncements = announcements.filter((a) => !isScheduled(a, now) && new Date(a.expires_at) <= now);

  return (
    <AnnouncementPage
      scheduledAnnouncements={announcements.filter((a) => isScheduled(a, now))}
      currentAnnouncements={currentAnnouncements}
      expiredAnnouncements={expiredAnnouncements}
    />
  );
}
