"use client";

interface ConfirmationModalProps {
  message: string;
  buttons: { value: string; label: string; variant?: "danger" | "default" }[];
  closeModal: (confirmedAction: string) => void;
}

export default function ConfirmationModal({
  message,
  buttons,
  closeModal,
}: Readonly<ConfirmationModalProps>) {
  return (
    <div className="modal-box p-0 rounded-2xl overflow-hidden max-w-sm w-full shadow-xl">
      <div className="px-6 py-5">
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 36, height: 36, backgroundColor: "#FEE2E2" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-ink leading-snug pt-1">{message}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
        {buttons.map((button) => (
          <button
            key={button.label}
            onClick={() => closeModal(button.value)}
            className={
              button.variant === "danger"
                ? "px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-coral hover:bg-coral/90 transition-colors"
                : "px-4 py-2 rounded-xl text-[13px] font-semibold text-ink border border-line hover:bg-canvas transition-colors"
            }
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}
