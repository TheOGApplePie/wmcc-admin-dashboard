"use client";
import { useAnnouncementModal } from "../modalContext";

export default function AddButton() {
  const { openAdd } = useAnnouncementModal();
  return (
    <button className="btn btn-success" onClick={() => openAdd()}>
      Add New
    </button>
  );
}
