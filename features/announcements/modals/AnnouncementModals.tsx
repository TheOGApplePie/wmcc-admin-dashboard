"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import ConfirmationModal from "@/app/components/ui/ConfirmationModal";
import { AnnouncementModal } from "./AnnouncementModal";
import { RestoreModal } from "./RestoreModal";
import { useAnnouncementModal } from "../modalContext";
import { Modal } from "./Modal";

export default function AnnouncementModals({
  confirmDeleteAnnouncement,
}: Readonly<{
  confirmDeleteAnnouncement(confirmAction: string, announcementId: number): Promise<void>;
}>) {
  const { modal, close } = useAnnouncementModal();
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  async function handleDelete(action: string) {
    if (modal.type !== "DELETE" || deletingRef.current) return;
    if (action !== "yes") { close(); return; }
    deletingRef.current = true;
    setDeleting(true);
    try {
      await confirmDeleteAnnouncement(action, modal.entity.id);
      toast.success("Announcement deleted.");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete the announcement.");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }
  if (modal.type === "NONE") return null;

  return (
    <Modal onClose={close} busy={deleting}>
      {modal.type === "EDIT" && (
        <AnnouncementModal announcement={modal.entity} closeModal={close} />
      )}
      {modal.type === "DELETE" && (
        <ConfirmationModal
          message="Are you sure you want to delete this announcement? This action cannot be undone."
          buttons={[
            { value: "yes", label: "Delete", variant: "danger" },
            { value: "no",  label: "Cancel" },
          ]}
          isLoading={deleting}
          closeModal={handleDelete}
        />
      )}
      {modal.type === "RESTORE" && (
        <RestoreModal announcement={modal.entity} closeModal={close} />
      )}
    </Modal>
  );
}
