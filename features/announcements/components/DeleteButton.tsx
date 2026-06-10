"use client";
import { Announcement } from "@/app/schemas/announcement";
import { useAnnouncementModal } from "../modalContext";

export default function DeleteButton({
  announcement,
}: Readonly<{
  announcement: Announcement;
}>) {
  const { openDelete } = useAnnouncementModal();
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors bg-coral-soft hover:bg-coral/20 text-coral w-full"
      onClick={() => openDelete(announcement)}
    >
      Delete
    </button>
  );
}
