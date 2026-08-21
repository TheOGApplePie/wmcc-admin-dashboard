import { AnnouncementPage } from "@/features/announcements";
import { fetchAnnouncements } from "../../../features/announcements/actions";
import type { Announcement } from "@/app/schemas/announcement";
import { requirePermission } from "@/features/access/server";

export default async function Announcements() {
  await requirePermission("announcements", "view");
  const announcements: Announcement[] = (await fetchAnnouncements()).data ?? [];
  const now = new Date();
  const currentAnnouncements = announcements.filter((a) => new Date(a.expires_at) >= now);
  const expiredAnnouncements = announcements.filter((a) => new Date(a.expires_at) < now);

  return (
    <AnnouncementPage
      key={announcements.map((item) => `${item.id}:${item.display_order}:${item.expires_at}`).join("|")}
      currentAnnouncements={currentAnnouncements}
      expiredAnnouncements={expiredAnnouncements}
    />
  );
}
