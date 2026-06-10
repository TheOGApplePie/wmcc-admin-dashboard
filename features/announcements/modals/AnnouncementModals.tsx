import ConfirmationModal from "./ConfirmationModal";
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
  if (modal.type === "NONE") return null;

  return (
    <Modal>
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
          closeModal={(action) => {
            confirmDeleteAnnouncement(action, modal.entity.id);
            close();
          }}
        />
      )}
      {modal.type === "RESTORE" && (
        <RestoreModal announcement={modal.entity} closeModal={close} />
      )}
    </Modal>
  );
}
