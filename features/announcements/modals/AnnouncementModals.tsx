import ConfirmationModal from "./ConfirmationModal";
import { AnnouncementModal } from "./AnnouncementModal";
import { useAnnouncementModal } from "../modalContext";
import { Modal } from "./Modal";

export default function AnnouncementModals({
  confirmDeleteAnnouncement,
}: {
  confirmDeleteAnnouncement(
    confirmAction: string,
    announcementId: number
  ): Promise<void>;
}) {
  const { modal, close } = useAnnouncementModal();
  if (modal.type === "NONE") return null;

  return (
    <Modal>
      {modal.type === "EDIT" ? (
        <AnnouncementModal
          announcement={modal.entity}
          closeModal={() => {
            close();
          }}
        />
      ) : (
        <ConfirmationModal
          message={
            "Are you sure you want to delete this announcement? This action cannot be undone"
          }
          buttons={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          closeModal={(e) => {
            confirmDeleteAnnouncement(e, modal.entity.id);
            close();
          }}
        />
      )}
    </Modal>
  );
}
