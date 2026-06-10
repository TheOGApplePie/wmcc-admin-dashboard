"use client";
import { useAnnouncementModal } from "../modalContext";

export default function AddButton() {
  const { openAdd } = useAnnouncementModal();
  return (
    <button
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-colors bg-teal hover:bg-teal-dark shadow-[0_8px_18px_-8px_rgba(15,128,115,.8)] active:scale-[.98]"
      onClick={() => openAdd()}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      New Announcement
    </button>
  );
}
