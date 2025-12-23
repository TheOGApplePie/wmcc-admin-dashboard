import { AnnouncementPage } from "@/features/announcements";
import { fetchAnnouncements } from "../../../features/announcements/actions";

export default async function Announcements() {
  const announcements = (await fetchAnnouncements()).data ?? [];
  return <AnnouncementPage announcements={announcements} />;
}
