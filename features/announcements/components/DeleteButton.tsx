"use client";

import { Announcement } from "@/app/schemas/announcement";
import { useAnnouncementModal } from "../modalContext";

export default function DeleteButton({
  announcement,
}: {
  announcement: Announcement;
}) {
  const { openDelete } = useAnnouncementModal();
  return (
    <>
      <button
        className="btn btn-error"
        onClick={() => {
          openDelete(announcement);
        }}
      >
        Delete
      </button>
    </>
  );
}
