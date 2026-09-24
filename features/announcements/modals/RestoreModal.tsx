"use client";

import { useState } from "react";
import { useModalDismissGuard } from "./Modal";
import toast from "react-hot-toast";
import { Announcement } from "@/app/schemas/announcement";
import { restoreAnnouncement } from "@/features/announcements/actions";
import { formatDateTimeLocal, torontoInputToUtc } from "@/app/utils/date";

interface RestoreModalProps {
  announcement: Announcement;
  closeModal: () => void;
}

export function RestoreModal({ announcement, closeModal }: Readonly<RestoreModalProps>) {
  const minDate = formatDateTimeLocal(new Date());
  const [expiresAt, setExpiresAt] = useState(minDate);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useModalDismissGuard(() => !saving);

  async function handleRestore() {
    setSaving(true);
    setError(null);
    try {
      const chosen = torontoInputToUtc(expiresAt);
      if (isNaN(chosen.getTime()) || chosen <= new Date()) {
        setError("Please choose a future Toronto date and time.");
        return;
      }
      const result = await restoreAnnouncement({ id: announcement.id, expires_at: chosen });
      if (!result?.data?.success && !result?.data?.error) throw new Error("Unable to restore the announcement. Check the end date and try again.");
      if (result.data?.error) throw new Error(result.data.error);
      toast.success("Announcement restored to live rotation!");
      closeModal();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to restore the announcement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-box p-0 rounded-2xl overflow-hidden max-w-sm w-full shadow-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-line">
        <h2 className="text-[15px] font-bold">Restore announcement</h2>
        <p className="text-[12px] text-muted mt-0.5">
          Set a new end date to push &ldquo;{announcement.title}&rdquo; back into the live rotation.
        </p>
      </div>

      {/* Body */}
      <div className="px-6 py-5 flex flex-col gap-3">
        <label htmlFor="restore-end-date" className="text-[12px] font-semibold text-ink">New end date</label>
        <input
          disabled={saving}
          id="restore-end-date"
          type="datetime-local"
          min={minDate}
          value={expiresAt}
          onChange={(e) => { setExpiresAt(e.target.value); setError(null); }}
          suppressHydrationWarning
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-teal transition-colors"
        />
        {error && <p role="alert" className="text-[11px] text-coral">{error}</p>}
        <p className="text-[11px] text-muted">
          After this date it will auto-archive again.
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
        <button
          type="button"
          disabled={saving}
          onClick={closeModal}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold text-ink border border-line hover:bg-canvas transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleRestore}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-teal hover:bg-teal-dark disabled:opacity-50 transition-colors shadow-[0_4px_12px_-4px_rgba(15,128,115,.5)]"
        >
          {saving ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.99" />
            </svg>
          )}
          Restore to live
        </button>
      </div>
    </div>
  );
}
