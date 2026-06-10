"use client";

import { useForm } from "react-hook-form";
import Image from "next/image";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Announcement } from "@/app/schemas/announcement";
import { createAnnouncement, editAnnouncement } from "@/features/announcements/actions";
import { useAnnouncementModal } from "@/features/announcements/modalContext";
import { FIVE_MB } from "@/app/constants/general";
import { formatDateTimeLocal } from "@/app/utils/date";
import { Field, INPUT } from "@/app/components/ui/Field";

// ─── Modal ────────────────────────────────────────────────────────────────────

interface AnnouncementModalProps {
  announcement: Announcement | null;
  closeModal: () => void;
}

export function AnnouncementModal({ announcement, closeModal }: Readonly<AnnouncementModalProps>) {
  const { openDelete } = useAnnouncementModal();
  const isEdit = announcement !== null;
  const isExpired = isEdit && new Date(announcement.expires_at) < new Date();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
    watch,
  } = useForm<Announcement>({
    mode: "onChange",
    defaultValues: isEdit
      ? { ...announcement, expires_at: formatDateTimeLocal(announcement.expires_at) }
      : {
          id: undefined,
          title: "",
          description: "",
          poster_url: null,
          poster_alt: "",
          poster_file: [],
          call_to_action_link: "",
          call_to_action_caption: "",
          expires_at: new Date(),
        },
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(announcement?.poster_url ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const watchedCaption = watch("call_to_action_caption");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > FIVE_MB) {
      setError("poster_file", { message: "File must be under 5 MB." });
      return;
    }
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      setError("poster_file", { message: "Only JPG or PNG images are supported." });
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  const { ref: rhfFileRef, ...fileRegister } = register("poster_file", { onChange: handleFileChange });

  function clearPoster() {
    setPreviewUrl(null);
    reset({ ...watch(), poster_file: [], poster_url: null, poster_alt: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(data: Announcement) {
    const payload = {
      ...data,
      poster_url: data.poster_url?.length ? data.poster_url : null,
      poster_alt: data.poster_alt ?? null,
      poster_file: data.poster_file ?? [],
      call_to_action_link: data.call_to_action_link ?? null,
      expires_at: new Date(data.expires_at).toISOString(),
    };

    const response = isEdit
      ? await editAnnouncement(payload)
      : await createAnnouncement(payload);

    if (response?.data?.error) {
      toast.error(response.data.error as string);
    } else if (response?.validationErrors) {
      console.error(response.validationErrors);
    } else {
      toast.success(isEdit ? "Announcement updated!" : "Announcement created!");
      closeModal();
    }
  }

  function handleCancel() {
    reset();
    setPreviewUrl(null);
    closeModal();
  }

  function handleDelete() {
    if (announcement) {
      closeModal();
      openDelete(announcement);
    }
  }

  return (
    <div className="modal-box p-0 rounded-2xl overflow-hidden max-w-lg w-full shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <h2 className="text-[15px] font-bold">
          {isEdit ? "Edit announcement" : "New announcement"}
        </h2>
        {isEdit && (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: isExpired ? "#FEE2E2" : "#CCFBF1",
              color:           isExpired ? "#B91C1C" : "#065F46",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isExpired ? "#B91C1C" : "#0F8073" }} />
            {isExpired ? "Expired" : "Live"}
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div
          className="px-6 py-5 flex flex-col gap-4 overflow-y-auto"
          style={{ maxHeight: "calc(100dvh - 220px)" }}
        >
          <input type="hidden" {...register("id")} />

          <Field label="Title" error={errors.title?.message}>
            <input
              className={INPUT}
              maxLength={50}
              placeholder="Announcement title"
              {...register("title", {
                required: "Title is required.",
                minLength: { value: 3,  message: "At least 3 characters." },
                maxLength: { value: 50, message: "50 characters max." },
              })}
            />
          </Field>

          <Field label="Description" error={errors.description?.message}>
            <textarea
              className={INPUT + " resize-none"}
              rows={3}
              maxLength={100}
              placeholder="Brief description shown in the carousel"
              {...register("description", {
                required: "Description is required.",
                minLength: { value: 20, message: "At least 20 characters." },
                maxLength: { value: 100, message: "100 characters max." },
              })}
            />
          </Field>

          {/* CTA caption + End date */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Call to action" error={errors.call_to_action_caption?.message}>
              <input
                className={INPUT}
                maxLength={20}
                placeholder="Button label"
                {...register("call_to_action_caption", {
                  validate: (v, { call_to_action_link: link }) =>
                    !link || !!v || "Caption required when link is set.",
                })}
              />
            </Field>
            <Field
              label="End date"
              error={errors.expires_at?.message}
              hint='After this date it auto-archives. Set far future to keep indefinitely.'
            >
              <input
                type="datetime-local"
                className={INPUT}
                min={formatDateTimeLocal(new Date())}
                suppressHydrationWarning
                {...register("expires_at", {
                  required: "End date is required.",
                  validate: (v) => new Date(v) > new Date() || "Must be a future date.",
                })}
              />
            </Field>
          </div>

          {/* CTA link — shown when caption has a value */}
          {!!watchedCaption && (
            <Field label="Call to action link" error={errors.call_to_action_link?.message}>
              <input
                type="url"
                className={INPUT}
                placeholder="https://…"
                {...register("call_to_action_link", {
                  validate: (v, { call_to_action_caption: cap }) =>
                    !cap || !!v || "Link required when caption is set.",
                })}
              />
            </Field>
          )}

          {/* Poster */}
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-semibold text-ink">
              Poster <span className="font-normal text-muted">· optional</span>
            </p>

            {previewUrl ? (
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-line">
                  <Image src={previewUrl} alt="" fill className="object-cover" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[12px] text-ink">shown beside text</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[12px] font-semibold text-teal hover:text-teal-dark transition-colors text-left"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={clearPoster}
                    className="text-[11px] text-muted hover:text-coral transition-colors text-left"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-6 text-[12px] text-muted hover:border-teal/40 hover:text-teal transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload poster image
              </button>
            )}

            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              ref={(el) => { rhfFileRef(el); fileInputRef.current = el; }}
              {...fileRegister}
            />
            {errors.poster_file && (
              <p className="text-[11px] text-coral">{errors.poster_file.message as string}</p>
            )}

            {previewUrl && (
              <Field label="Poster alt text" error={errors.poster_alt?.message}>
                <input
                  className={INPUT}
                  maxLength={100}
                  placeholder="Describe the image for screen readers"
                  {...register("poster_alt", {
                    validate: (v) => !previewUrl || !!v || "Alt text is required when a poster is set.",
                  })}
                />
              </Field>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-line">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-coral border border-coral/30 hover:bg-coral/5 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
              </svg>
              Delete
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold text-ink border border-line hover:bg-canvas transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-teal hover:bg-teal-dark disabled:opacity-50 transition-colors shadow-[0_4px_12px_-4px_rgba(15,128,115,.5)]"
            >
              {isSubmitting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
