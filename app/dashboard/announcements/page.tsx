import { fetchAnnouncements } from "../../../actions/announcements";
import AnnouncementBrowser from "@/app/components/announcementsBrowser";

export default async function Announcements() {
  const announcements = (await fetchAnnouncements()).data?.data ?? null;
  return (
    <div className="flex flex-col justify-center mx-16 mt-8 gap-8">
      <div>
        <h1 className="text-3xl font-bold">Announcements Configuration</h1>
      </div>
      <div className="flex justify-center">
        <AnnouncementBrowser announcements={announcements} />
      </div>
    </div>
  );
}
