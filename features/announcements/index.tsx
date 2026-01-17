"use client";
import { Announcement } from "@/app/schemas/announcement";
import AnnouncementBrowser from "./components/announcementsBrowser";
import AnnouncementTable from "./components/announcementTable";
import AnnouncementModals from "./modals/AnnouncementModals";
import { deleteAnnouncement } from "./actions";
import { AnnouncementModalProvider } from "./modalContext";

async function confirmDeleteAnnouncement(
  confirmAction: string,
  announcementId: number
) {
  if (confirmAction === "yes") {
    await deleteAnnouncement({
      id: announcementId,
    });
  }
}

export function AnnouncementPage({
  announcements,
}: Readonly<{
  announcements: Announcement[];
}>) {
  const currentAnnouncements =
    announcements?.filter(
      (announcement) => new Date(announcement.expires_at) >= new Date()
    ) ?? [];
  const expiredAnnouncements =
    announcements?.filter(
      (announcement) => new Date(announcement.expires_at) < new Date()
    ) ?? [];

  return (
    <div className="flex flex-col justify-center mx-16 mt-8 gap-8">
      <div>
        <h1 className="text-3xl font-bold">Announcements Configuration</h1>
      </div>
      <div className="flex flex-col items-center py-3">
        <AnnouncementModalProvider>
          <AnnouncementBrowser announcements={currentAnnouncements} />
          <div className="p-3">
            <h2>Expired Announcements</h2>
          </div>
          <AnnouncementTable announcements={expiredAnnouncements} />
          <AnnouncementModals
            confirmDeleteAnnouncement={confirmDeleteAnnouncement}
          />
        </AnnouncementModalProvider>
      </div>
    </div>
  );
}
