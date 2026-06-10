import { AnnouncementPage } from "@/features/announcements";
import { fetchAnnouncements } from "../../../features/announcements/actions";
import type { Announcement } from "@/app/schemas/announcement";

export default async function Announcements() {
  const announcements: Announcement[] = (await fetchAnnouncements()).data ?? [];
  const now = new Date();
  const currentAnnouncements = announcements.filter((a) => new Date(a.expires_at) >= now);
  const expiredAnnouncements = announcements.filter((a) => new Date(a.expires_at) < now);

  return (
    <AnnouncementPage
      currentAnnouncements={currentAnnouncements}
      expiredAnnouncements={expiredAnnouncements}
    />
  );
}
