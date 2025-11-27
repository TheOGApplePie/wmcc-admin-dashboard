"use client";
interface ConfirmationModalProps {
  buttons: { value: string; label: string }[];
  message: string;
  closeModal: (confirmedAction?: string) => void;
}
export default function ConfirmationModal({
  buttons,
  message,
  closeModal,
}: Readonly<ConfirmationModalProps>) {
  return (
    <div className="p-8 modal-box">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg">{message}</h3>
        </div>
      </div>
      <div className="modal-action my-0">
        {buttons.map((button) => (
          <button
            className="btn btn-outline"
            key={button.label}
            onClick={() => {
              closeModal(button.value);
            }}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}
