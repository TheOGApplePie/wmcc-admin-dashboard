import { AnnouncementPage } from "@/features/announcements";
import { fetchAnnouncements } from "../../../features/announcements/actions";

export default async function Announcements() {
  const announcements = (await fetchAnnouncements()).data ?? [];
  const now = new Date();
  const currentAnnouncements = announcements.filter(
    (a) => new Date(a.expires_at) >= now,
  );
  const expiredAnnouncements = announcements.filter(
    (a) => new Date(a.expires_at) < now,
  );
  return (
    <AnnouncementPage
      currentAnnouncements={currentAnnouncements}
      expiredAnnouncements={expiredAnnouncements}
    />
  );
}
