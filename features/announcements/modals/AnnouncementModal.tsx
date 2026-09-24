"use client";

import { useForm, useWatch } from "react-hook-form";
import AnnouncementImage from "@/features/announcements/components/AnnouncementImage";
import AnnouncementStatusBadge from "../components/AnnouncementStatusBadge";
import { useState } from "react";
import { useUnsavedChanges } from "@/features/events/hooks/useUnsavedChanges";
import { useModalDismissGuard } from "./Modal";
import toast from "react-hot-toast";
import { Announcement } from "@/app/schemas/announcement";
import {
  createAnnouncement,
  editAnnouncement,
} from "@/features/announcements/actions";
import { useAnnouncementModal } from "@/features/announcements/modalContext";
import StorageMediaPicker from "@/app/components/ui/StorageMediaPicker";
import { isScheduled } from "../announcementUtils";
import { formatDateTimeLocal, torontoInputToUtc } from "@/app/utils/date";
import { Field, INPUT } from "@/app/components/ui/Field";
import { useCan } from "@/store/hooks";

// ─── Modal ────────────────────────────────────────────────────────────────────

interface AnnouncementModalProps {
  announcement: Announcement | null;
  closeModal: () => void;
}

export function AnnouncementModal({
  announcement,
  closeModal,
}: Readonly<AnnouncementModalProps>) {
  const { openDelete } = useAnnouncementModal();
  const canDelete = useCan("announcements.delete");
  const isEdit = announcement !== null;

  const [publicationMode, setPublicationMode] = useState<"now" | "scheduled">(
    announcement && isScheduled(announcement) ? "scheduled" : "now",
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    setError,
    clearErrors,
    reset,
    control,
    setValue,
  } = useForm<Announcement>({
    mode: "onChange",
    defaultValues: isEdit
      ? {
          ...announcement,
          publish_at: formatDateTimeLocal(announcement.publish_at),
          expires_at: formatDateTimeLocal(announcement.expires_at),
        }
      : {
          id: undefined,
          publish_at: "",
          title: "",
          description: "",
          poster_url: null,
          poster_alt: "",
          poster_file: [],
          call_to_action_link: "",
          call_to_action_caption: "",
          expires_at: "",
        },
  });

  const originalMode = announcement && isScheduled(announcement) ? "scheduled" : "now";
  const confirmDiscard = useUnsavedChanges(isDirty || publicationMode !== originalMode);
  useModalDismissGuard(() => !isSubmitting && confirmDiscard());

  const [previewUrl, setPreviewUrl] = useState<string | null>(
    announcement?.poster_url ?? null,
  );
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const watchedCaption = useWatch({ control, name: "call_to_action_caption" });

  function selectPoster(urls: string[]) {
    const url = urls[0] ?? null;
    setValue("poster_url", url, { shouldDirty: true });
    setValue("poster_file", [], { shouldDirty: true });
    if (!url) setValue("poster_alt", "", { shouldDirty: true });
    clearErrors(["poster_file", "poster_url"]);
    setPreviewUrl(url);
  }

  function clearPoster() { selectPoster([]); }

  async function onSubmit(data: Announcement) {
    let publishAt: string | null;
    let expiresAt: string;
    try {
      if (publicationMode === "scheduled" && !data.publish_at) {
        setError("publish_at", {
          message: "Choose a future go-live date and time.",
        });
        return;
      }
      publishAt =
        publicationMode === "scheduled" && data.publish_at
          ? torontoInputToUtc(data.publish_at).toISOString()
          : null;
      if (publishAt && new Date(publishAt) <= new Date()) {
        setError("publish_at", {
          message: "Go-live time must be in the future.",
        });
        return;
      }
      expiresAt = torontoInputToUtc(data.expires_at).toISOString();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Invalid date and time.",
      );
      return;
    }
    if (publishAt && new Date(publishAt) >= new Date(expiresAt)) {
      setError("expires_at", {
        message: "End date must be after the go-live time.",
      });
      return;
    }
    const payload = {
      ...data,
      poster_url: data.poster_url?.length ? data.poster_url : null,
      poster_alt: data.poster_alt ?? null,
      poster_file: [],
      call_to_action_link: data.call_to_action_link ?? null,
      publish_at: publishAt,
      expires_at: expiresAt,
    };

    try {
      const response = isEdit ? await editAnnouncement(payload) : await createAnnouncement(payload);
      if (response?.data?.error) throw new Error(response.data.error);
      if (!response?.data?.success) throw new Error("Unable to save. Check the announcement details and try again.");
      toast.success(isEdit ? "Announcement updated!" : "Announcement created!");
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save. Please try again.");
    }
  }

  function handleCancel() {
    if (isSubmitting || !confirmDiscard()) return;
    reset();
    setPreviewUrl(null);
    closeModal();
  }

  function handleDelete() {
    if (announcement && !isSubmitting && confirmDiscard()) {
      closeModal();
      openDelete(announcement);
    }
  }

  return (
    <>
    {mediaPickerOpen && <StorageMediaPicker context="announcements" mediaKind="image" maximum={1}
      selectedUrls={previewUrl ? [previewUrl] : []} onChange={selectPoster} onClose={() => setMediaPickerOpen(false)} />}
    <div className="modal-box p-0 rounded-2xl overflow-hidden max-w-lg w-full shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <h2 className="text-[15px] font-bold">
          {isEdit ? "Edit announcement" : "New announcement"}
        </h2>
        {isEdit && <AnnouncementStatusBadge announcement={announcement} />}
      </div>

      {/* Scrollable body */}
      <form onSubmit={handleSubmit(onSubmit)} aria-busy={isSubmitting}>
        <fieldset disabled={isSubmitting} className="min-w-0">
        <div
          className="px-6 py-5 flex flex-col gap-4 overflow-y-auto"
          style={{ maxHeight: "calc(100dvh - 220px)" }}
        >
          <input type="hidden" {...register("id")} />

          <fieldset className="flex flex-col gap-2">
            <legend className="text-[12px] font-semibold mb-2">
              Publication
            </legend>
            <div className="flex gap-4 text-[12px]">
              {(["now", "scheduled"] as const).map((mode) => (
                <label
                  key={mode}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="publicationMode"
                    value={mode}
                    checked={publicationMode === mode}
                    onChange={() => {
                      setPublicationMode(mode);
                      clearErrors("publish_at");
                    }}
                    className="radio radio-sm"
                  />
                  {mode === "now" ? "Go live now" : "Schedule for later"}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted">
              {publicationMode === "now"
                ? "Visible on the website as soon as you save."
                : "Hidden from the website after you save, then automatically live at the selected time."}
            </p>
          </fieldset>

          {publicationMode === "scheduled" && (
            <Field
              label="Go-live date and time"
              error={errors.publish_at?.message}
              hint="Toronto time. Choose a future date and time."
            >
              <input
                type="datetime-local"
                className={INPUT}
                {...register("publish_at")}
              />
            </Field>
          )}

          <Field label="Title" error={errors.title?.message}>
            <input
              className={INPUT}
              maxLength={50}
              placeholder="Announcement title"
              {...register("title", {
                required: "Title is required.",
                minLength: { value: 3, message: "At least 3 characters." },
                maxLength: { value: 50, message: "50 characters max." },
              })}
            />
          </Field>

          <Field label="Description" error={errors.description?.message}>
            <textarea
              className={INPUT + " resize-none"}
              rows={3}
              maxLength={200}
              placeholder="Brief description shown in the carousel"
              {...register("description", {
                required: "Description is required.",
                minLength: { value: 20, message: "At least 20 characters." },
                maxLength: { value: 200, message: "200 characters max." },
              })}
            />
          </Field>

          {/* CTA caption + End date */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Call to action"
              error={errors.call_to_action_caption?.message}
            >
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
              hint="Toronto time. Must be after the go-live time."
            >
              <input
                type="datetime-local"
                className={INPUT}
                min={formatDateTimeLocal(new Date())}
                suppressHydrationWarning
                {...register("expires_at", {
                  required: "End date is required.",
                  validate: (v) => {
                    try {
                      return (
                        torontoInputToUtc(v) > new Date() ||
                        "Must be a future date."
                      );
                    } catch {
                      return "Choose a valid Toronto date and time.";
                    }
                  },
                })}
              />
            </Field>
          </div>

          {/* CTA link — shown when caption has a value */}
          {!!watchedCaption && (
            <Field
              label="Call to action link"
              error={errors.call_to_action_link?.message}
            >
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
                  <AnnouncementImage
                    src={previewUrl}
                    alt=""
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[12px] text-ink">shown beside text</p>
                  <button
                    type="button"
                    onClick={() => setMediaPickerOpen(true)}
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
                onClick={() => setMediaPickerOpen(true)}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-6 text-[12px] text-muted hover:border-teal/40 hover:text-teal transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Choose poster from storage
              </button>
            )}

            {previewUrl && (
              <Field label="Poster alt text" error={errors.poster_alt?.message}>
                <input
                  className={INPUT}
                  maxLength={100}
                  placeholder="Describe the image for screen readers"
                  {...register("poster_alt", {
                    validate: (v) =>
                      !previewUrl ||
                      !!v ||
                      "Alt text is required when a poster is set.",
                  })}
                />
              </Field>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-line">
          {isEdit && canDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-coral border border-coral/30 hover:bg-coral/5 transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
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
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              Save
            </button>
          </div>
        </div>
        </fieldset>
      </form>
    </div>
    </>
  );
}
