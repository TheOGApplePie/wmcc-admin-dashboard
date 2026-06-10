"use client";

import { Announcement } from "@/app/schemas/announcement";
import AnnouncementsClient from "./components/AnnouncementsClient";
import AnnouncementModals from "./modals/AnnouncementModals";
import { deleteAnnouncement } from "./actions";
import { AnnouncementModalProvider, useAnnouncementModal } from "./modalContext";
import { PageShell } from "@/app/components/ui/PageShell";

async function confirmDeleteAnnouncement(confirmAction: string, announcementId: number) {
  if (confirmAction === "yes") {
    await deleteAnnouncement({ id: announcementId });
  }
}

function AnnouncementsHeaderActions() {
  const { openAdd } = useAnnouncementModal();
  return (
    <div className="flex items-center gap-2">
      <a
        href="https://www.wmcc.ca"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold text-ink border border-line hover:bg-canvas transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        Open site
      </a>
      <button
        onClick={openAdd}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold text-white transition-colors shadow-[0_4px_12px_-4px_rgba(15,128,115,.5)]"
        style={{ backgroundColor: "#0F8073" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New announcement
      </button>
    </div>
  );
}

export function AnnouncementPage({
  currentAnnouncements,
  expiredAnnouncements,
}: Readonly<{
  currentAnnouncements: Announcement[];
  expiredAnnouncements: Announcement[];
}>) {
  return (
    <AnnouncementModalProvider>
      <PageShell
        title="Announcements"
        subtitle="Preview and manage active announcements"
        actions={<AnnouncementsHeaderActions />}
      >
        <AnnouncementsClient
          currentAnnouncements={currentAnnouncements}
          expiredAnnouncements={expiredAnnouncements}
        />
        <AnnouncementModals confirmDeleteAnnouncement={confirmDeleteAnnouncement} />
      </PageShell>
    </AnnouncementModalProvider>
  );
}
