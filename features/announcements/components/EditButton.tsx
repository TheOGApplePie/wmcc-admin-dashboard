"use client";
import { Announcement } from "@/app/schemas/announcement";
import { useAnnouncementModal } from "../modalContext";
import { useCan } from "@/store/hooks";

export default function EditButton({
  announcement,
}: Readonly<{
  announcement: Announcement;
}>) {
  const { openEdit } = useAnnouncementModal();
  const canEdit = useCan("announcements.edit");
  if (!canEdit) return null;
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors bg-teal-soft hover:bg-teal/20 text-teal-dark w-full"
      onClick={() => openEdit(announcement)}
    >
      Edit
    </button>
  );
}
