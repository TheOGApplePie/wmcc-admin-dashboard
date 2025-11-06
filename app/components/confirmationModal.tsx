"use client";
interface ConfirmationModalProps {
  closeModal: (confirmAction: boolean) => void;
}
export default function ConfirmationModal({
  closeModal,
}: Readonly<ConfirmationModalProps>) {
  return (
    <div className="p-8 modal-box">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg">
            Are you sure you want to proceed with this action? Once performed,
            it cannot be undone.
          </h3>
        </div>
      </div>
      <div className="modal-action my-0">
        <button
          className="btn btn-outline btn-warning"
          onClick={() => {
            closeModal(true);
          }}
        >
          Yes
        </button>
        <button
          className="btn btn-outline btn-error"
          onClick={() => {
            closeModal(false);
          }}
        >
          No
        </button>
      </div>
    </div>
  );
}
