"use client";
import { Announcement } from "@/app/schemas/announcement";
import { useAnnouncementModal } from "../modalContext";

export default function EditButton({
  announcement,
}: {
  announcement: Announcement;
}) {
  const { openEdit } = useAnnouncementModal();
  return (
    <button className="btn btn-neutral" onClick={() => openEdit(announcement)}>
      Edit
    </button>
  );
}
