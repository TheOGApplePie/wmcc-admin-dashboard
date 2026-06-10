"use client";
import { Event } from "../schemas/events";
import { useForm, useWatch, Controller } from "react-hook-form";
import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { createEvent, editEvent, deleteEvent } from "@/actions/events";
import { FIVE_MB, URL_REGEX } from "../constants/general";
import toast from "react-hot-toast";
import ConfirmationModal from "../../features/announcements/modals/ConfirmationModal";
import { formatDateTimeLocal } from "../utils/date";
import { toEstDay } from "@/utils/expandEvents";
import { Field, INPUT } from "./ui/Field";

const NO_IMAGE_URL =
  "https://gkpctbvyswcfccogoepl.supabase.co/storage/v1/object/public/event-posters/public/NO%20IMAGE.png";

const CHIP =
  "inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-line bg-surface text-[12px] font-medium text-muted cursor-pointer transition-colors peer-checked:bg-teal peer-checked:border-teal peer-checked:text-white hover:border-teal/40";

function WMCCLoader() {
  return (
    <div className="flex gap-1 items-end py-6">
      {["W", "M", "C", "C"].map((letter, i) => (
        <span
          key={`${letter}-${i}`}
          className="text-2xl font-black animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

function RadioPill({
  name,
  value,
  checked,
  onChange,
  label,
}: Readonly<{
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
}>) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        className="peer sr-only"
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className={CHIP}>{label}</span>
    </label>
  );
}

interface EventModalProps {
  event?: Event;
  occurrenceDate?: Date;
  closeModal: (reloadEvents: boolean) => void;
}
export default function EventModal({
  event,
  occurrenceDate,
  closeModal,
}: Readonly<EventModalProps>) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    setError,
    clearErrors,
    reset,
    resetField,
    setValue,
    control,
  } = useForm<Event>({
    mode: "onChange",
  });

  const daysOfTheWeek = [
    { label: "Sun", value: "su" },
    { label: "Mon", value: "mo" },
    { label: "Tue", value: "tu" },
    { label: "Wed", value: "we" },
    { label: "Thu", value: "th" },
    { label: "Fri", value: "fr" },
    { label: "Sat", value: "sa" },
  ];
  const frequencyKinds = [
    { label: "First", value: 1 },
    { label: "Second", value: 2 },
    { label: "Second Last", value: -2 },
    { label: "Last", value: -1 },
  ];

  const [imageUrl, setImageUrl] = useState<string | null>(
    event?.poster_url ?? null,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(!!event?.poster_url?.length);
  const [frequencyKind, setFrequencyKind] = useState<string>("day");
  const [recurrenceType, setRecurrenceType] = useState<string>("date");
  const [message, setMessage] = useState("");
  const [buttons, setButtons] = useState<{ label: string; value: string }[]>(
    [],
  );
  const [useFile, setUseFile] = useState<boolean>(!event?.poster_url?.length);
  const [updatedEvent, setUpdatedEvent] = useState<Event | null>(null);
  const [getConfirmation, setGetConfirmation] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const wasRecurring = event?.is_recurring ?? false;
  const fileChangedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (event) {
      let startDate: Date | string = event.start_date;
      let endDate: Date | string = event.end_date;

      if (occurrenceDate && event.is_recurring) {
        // occurrenceDate is a day marker (EST day at UTC midnight); shift the
        // original start by whole days so the event's time-of-day is preserved.
        const DAY_MS = 24 * 60 * 60 * 1000;
        const dayDiff = Math.round(
          (occurrenceDate.getTime() - toEstDay(event.start_date).getTime()) / DAY_MS,
        );
        const duration =
          new Date(event.end_date).getTime() -
          new Date(event.start_date).getTime();
        startDate = new Date(new Date(event.start_date).getTime() + dayDiff * DAY_MS);
        endDate = new Date(startDate.getTime() + duration);
      }

      setImageUrl(event.poster_url ?? null);
      setUseFile(!event.poster_url?.length);

      if (event.is_recurring && event.recurrence_rule) {
        const rule = event.recurrence_rule;
        setFrequencyKind(rule.by_month_day ? "date" : "day");
        setRecurrenceType(rule.count ? "count" : "date");
      }

      reset({
        ...event,
        start_date: formatDateTimeLocal(startDate),
        end_date: formatDateTimeLocal(endDate),
        recurrence_rule: event.is_recurring
          ? {
              ...event.recurrence_rule,
              until: event.recurrence_rule?.until
                ? new Date(event.recurrence_rule.until)
                    .toISOString()
                    .split("T")[0]
                : undefined,
            }
          : undefined,
      });
      if (event.is_recurring && event.recurrence_rule?.frequency) {
        setValue("recurrence_rule.frequency", event.recurrence_rule.frequency);
      }
    } else {
      setImageUrl(null);
      setImageFile(null);
      setUseFile(true);
      setFrequencyKind("day");
      setRecurrenceType("date");
      reset({
        id: undefined,
        title: "",
        description: "",
        location: "",
        poster_url: null,
        poster_alt: "",
        poster_file: [],
        call_to_action_link: "",
        call_to_action_caption: "",
        is_recurring: false,
        start_date: formatDateTimeLocal(new Date()),
        end_date: formatDateTimeLocal(new Date()),
        recurrence_rule: undefined,
      });
    }
  }, [event, occurrenceDate, reset, setValue]);

  const isRecurring = useWatch({ control, name: "is_recurring" });
  const frequency = useWatch({
    control,
    name: "recurrence_rule.frequency",
    defaultValue: "daily",
  });
  const byMonthDay = useWatch({
    control,
    name: "recurrence_rule.by_month_day",
  });

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      fileChangedRef.current = true;
      if (file.size > FIVE_MB) {
        setError("poster_file", {
          message:
            "This file is too big. Please select an image file less than 5MB.",
        });
      } else if (
        ["image/png", "image/jpeg", "image/jpg"].includes(file.type)
      ) {
        setIsImageLoading(true);
        setImageFile(file);
        setImageUrl(URL.createObjectURL(file));
      } else {
        setError("poster_file", {
          message:
            "This is an unsupported file type. Please upload a JPG/JPEG or PNG image.",
        });
      }
    } else {
      const url = event.target.value;
      if (url.length) {
        fileChangedRef.current = true;
        setIsImageLoading(true);
        setImageUrl(url);
      } else {
        setImageFile(null);
        setImageUrl(null);
      }
      clearErrors(["poster_file", "poster_url"]);
    }
  };

  // Pass the handler through register options so RHF's own onChange still
  // fires — overriding the onChange prop would stop values reaching form state.
  const { ref: rhfFileRef, ...fileRegister } = register("poster_file", {
    onChange: handleImageChange,
  });
  const posterUrlRegister = register("poster_url", { onChange: handleImageChange });
  async function confirmAction(action?: string) {
    showConfirmationModal(false);
    if (action && action !== "no" && updatedEvent) {
      const response = await editEvent({
        ...updatedEvent,
        poster_url: updatedEvent.poster_url?.length
          ? updatedEvent.poster_url
          : null,
        poster_alt: updatedEvent.poster_alt ?? null,
        poster_file: updatedEvent.poster_file ?? [],
        call_to_action_link: updatedEvent.call_to_action_link?.length
          ? updatedEvent.call_to_action_link
          : null,
        gallery_url: updatedEvent.gallery_url?.length
          ? updatedEvent.gallery_url
          : null,
        start_date: new Date(updatedEvent.start_date),
        end_date: new Date(updatedEvent.end_date),
        recurrence_rule: updatedEvent.is_recurring
          ? updatedEvent.recurrence_rule
          : undefined,
        occurrence_date:
          (action === "single" || action === "future") && occurrenceDate
            ? occurrenceDate
            : undefined,
        action,
      });
      if (response.data?.error) {
        toast.error(response.data?.error);
      } else if (response.validationErrors) {
        toast.error(
          "There seems to be something wrong with the form. Please double check your inputs.",
        );
        console.error(response.validationErrors);
      } else {
        toast.success(
          response.data?.statusText ?? "Event updated successfully!",
        );
        reset(); setImageUrl(null); setImageFile(null); fileChangedRef.current = false;
        closeModal(true);
      }
    }
  }

  const onSubmit = async (data: Event) => {
    if (data.recurrence_rule) {
      if (data.recurrence_rule.frequency !== "daily") {
        data.recurrence_rule.interval = 1;
      }
      if (frequencyKind === "date") {
        data.recurrence_rule.by_set_position = [];
        data.recurrence_rule.by_weekdays = [];
      } else if (frequencyKind === "day") {
        data.recurrence_rule.by_month_day = null;
      }
      if (recurrenceType === "date") {
        data.recurrence_rule.count = null;
      } else if (recurrenceType === "count") {
        data.recurrence_rule.until = null;
      }
    }
    setUpdatedEvent(data);
    if (data.id) {
      if (data.is_recurring && wasRecurring) {
        setMessage(
          "This is a recurring event. Do you want to apply the changes to all instances, just this one, or this one and future instances?",
        );
        setButtons([
          { value: "all", label: "All" },
          { value: "single", label: "This One" },
          { value: "future", label: "This + Future" },
        ]);
        showConfirmationModal();
      } else if (!data.is_recurring && wasRecurring) {
        setMessage(
          "You have removed the recurrence rule. In effect, all other instances of this event will be removed. Do you want to continue?",
        );
        setButtons([
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]);
        showConfirmationModal();
      } else {
        const response = await editEvent({
          ...data,
          poster_url: data.poster_url?.length ? data.poster_url : null,
          poster_alt: data.poster_alt ?? null,
          poster_file: data.poster_file ?? [],
          call_to_action_link: data.call_to_action_link?.length
            ? data.call_to_action_link
            : null,
          gallery_url: data.gallery_url?.length ? data.gallery_url : null,
          start_date: new Date(data.start_date),
          end_date: new Date(data.end_date),
          recurrence_rule: data.is_recurring ? data.recurrence_rule : undefined,
          action: "single",
        });
        if (response.data?.error) {
          toast.error(response.data?.error);
        } else if (response.validationErrors) {
          toast.error(
            "There seems to be something wrong with the form. Please double check your inputs.",
          );
          console.error(response.validationErrors, response);
        } else {
          toast.success(
            response.data?.statusText ?? "Event updated successfully!",
          );
          reset(); setImageUrl(null); setImageFile(null); fileChangedRef.current = false;
          closeModal(true);
        }
      }
    } else {
      const response = await createEvent({
        ...data,
        poster_url: data.poster_url?.length ? data.poster_url : null,
        poster_alt: data.poster_alt ?? null,
        poster_file: data.poster_file ?? [],
        call_to_action_link: data.call_to_action_link?.length
          ? data.call_to_action_link
          : null,
        gallery_url: data.gallery_url?.length ? data.gallery_url : null,
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date),
        recurrence_rule: data.is_recurring ? data.recurrence_rule : undefined,
      });
      if (response.data?.error) {
        toast.error(response.data?.error);
      } else if (response.validationErrors) {
        toast.error(
          "There seems to be something wrong with the form. Please double check your inputs.",
        );
        console.error(response.validationErrors);
      } else {
        toast.success(
          response.data?.statusText ?? "Event created successfully!",
        );
        reset();
        setImageUrl(null);
        setImageFile(null);
        closeModal(true);
      }
    }
  };
  const showConfirmationModal = (show = true) => {
    setGetConfirmation(show);
  };

  const handleDeleteConfirm = async (action: string) => {
    setShowDeleteConfirm(false);
    if (!event || action === "no") return;
    const result = await deleteEvent({
      id: event.id,
      action,
      recurrence_rule_id: event.recurrence_rule_id,
      start_date: occurrenceDate ?? new Date(event.start_date),
    });
    if (result?.data?.error) {
      toast.error(result.data.error);
    } else {
      toast.success("Event deleted successfully!");
      reset();
      setImageUrl(null);
      setImageFile(null);
      closeModal(true);
    }
  };

  const handleClose = () => {
    if ((isDirty || fileChangedRef.current) && !globalThis.confirm("Unsaved changes will be lost. Close anyway?")) return;
    reset();
    setImageUrl(null);
    setImageFile(null);
    fileChangedRef.current = false;
    closeModal(false);
  };

  const clearImage = () => {
    // setValue per-field — reset(partial) would replace ALL form values and
    // wipe title/description/dates.
    setValue("poster_file", [], { shouldDirty: true });
    setValue("poster_url", null, { shouldDirty: true });
    setValue("poster_alt", "", { shouldDirty: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setImageFile(null);
    setImageUrl(null);
  };

  return (
    <>
      <div className="modal-box p-0 rounded-2xl overflow-hidden max-w-2xl w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-bold">
              {event ? "Edit event" : "New event"}
            </h2>
            {event?.is_recurring && (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: "#CCFBF1", color: "#065F46" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Recurring
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Scrollable body */}
          <div
            className="px-6 py-5 flex flex-col gap-4 overflow-y-auto"
            style={{ maxHeight: "calc(100dvh - 220px)" }}
          >
            <input type="number" hidden {...register("id")} />

            <Field label="Title" error={errors.title?.message}>
              <input
                className={INPUT}
                maxLength={50}
                placeholder="Event title"
                {...register("title", {
                  required: {
                    value: true,
                    message: "Please enter a title for the event.",
                  },
                  maxLength: {
                    value: 50,
                    message:
                      "Please limit your title to less than 50 characters long.",
                  },
                  minLength: {
                    value: 3,
                    message:
                      "Please make sure your title is at least 3 characters long.",
                  },
                })}
              />
            </Field>

            <Field label="Description" error={errors.description?.message}>
              <textarea
                className={INPUT + " resize-none"}
                maxLength={1000}
                rows={4}
                placeholder="What's happening at this event?"
                {...register("description", {
                  required: {
                    value: true,
                    message: "Please enter a description for the event.",
                  },
                  maxLength: {
                    value: 1000,
                    message:
                      "Please limit your description to less than 1000 characters long.",
                  },
                  minLength: {
                    value: 20,
                    message:
                      "Please make sure your description is at least 20 characters long.",
                  },
                })}
              />
            </Field>

            {/* Start / End */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" error={errors.start_date?.message}>
                <input
                  className={INPUT}
                  type="datetime-local"
                  suppressHydrationWarning
                  {...register("start_date", {
                    required: {
                      value: true,
                      message:
                        "Please specify a start date and time for this event.",
                    },
                    validate: {
                      validateStartDate: (
                        start_date: string | Date,
                        { end_date }: { end_date: string | Date },
                      ) => {
                        if (end_date && start_date > end_date) {
                          return "You cannot set the start datetime to be after the end datetime.";
                        }
                        return true;
                      },
                    },
                  })}
                />
              </Field>
              <Field label="Ends" error={!errors.start_date ? errors.end_date?.message : undefined}>
                <input
                  className={INPUT}
                  type="datetime-local"
                  suppressHydrationWarning
                  {...register("end_date", {
                    required: {
                      value: true,
                      message:
                        "Please specify an end date and time for this event.",
                    },
                    validate: {
                      validateEndDate: (
                        end_date: string | Date,
                        { start_date }: { start_date: string | Date },
                      ) => {
                        if (start_date && start_date > end_date) {
                          return "You cannot set the end datetime to be before the start datetime.";
                        }
                        return true;
                      },
                    },
                  })}
                />
              </Field>
            </div>

            <Field label="Location" error={errors.location?.message}>
              <input
                className={INPUT}
                type="text"
                placeholder="Where is this event held?"
                {...register("location", {
                  required: {
                    value: true,
                    message: "Please specify a location for this event",
                  },
                })}
              />
            </Field>

            {/* CTA */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Call to action" error={errors.call_to_action_caption?.message}>
                <input
                  className={INPUT}
                  maxLength={20}
                  placeholder="Button label"
                  {...register("call_to_action_caption", {
                    maxLength: {
                      value: 20,
                      message: "Please limit the button text to 20 characters",
                    },
                    validate: {
                      validateCallToActionCaption: (
                        call_to_action_caption: string,
                        { call_to_action_link }: { call_to_action_link: string | null },
                      ) => {
                        if (call_to_action_link && !call_to_action_caption) {
                          return "Please add a caption for the call to action button, or remove the link.";
                        }
                        return true;
                      },
                    },
                  })}
                />
              </Field>
              <Field label="Call to action link" error={errors.call_to_action_link?.message}>
                <input
                  className={INPUT}
                  placeholder="https://…"
                  {...register("call_to_action_link", {
                    pattern: {
                      value: URL_REGEX,
                      message:
                        'Please enter a valid URL. Make sure it begins with "https://" and does not have any leading or trailing spaces.',
                    },
                    validate: {
                      validateCallToActionLink: (
                        call_to_action_link: string | null,
                        { call_to_action_caption }: { call_to_action_caption: string },
                      ) => {
                        if (!call_to_action_link && call_to_action_caption) {
                          return "Please add a link for the call to action button, or remove the caption.";
                        }
                        return true;
                      },
                    },
                  })}
                />
              </Field>
            </div>

            <Field label="Gallery URL" error={errors.gallery_url?.message}>
              <input
                className={INPUT}
                type="url"
                placeholder="https://…"
                {...register("gallery_url")}
              />
            </Field>

            {/* Poster */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-ink">
                  Poster <span className="font-normal text-muted">· optional</span>
                </p>
                <button
                  type="button"
                  onClick={() => setUseFile(!useFile)}
                  className="text-[11px] font-semibold text-teal hover:text-teal-dark transition-colors"
                >
                  {useFile ? "Use image URL instead" : "Upload a file instead"}
                </button>
              </div>

              {!useFile && (
                <input
                  type="url"
                  className={INPUT}
                  placeholder="https://… (image URL)"
                  {...posterUrlRegister}
                />
              )}

              {imageUrl ? (
                <div className="relative rounded-xl border border-line overflow-hidden bg-canvas">
                  <div className="flex items-center justify-center min-h-32 max-h-56 overflow-hidden">
                    {isImageLoading && (
                      <div className="absolute inset-0 flex justify-center items-center z-10">
                        <WMCCLoader />
                      </div>
                    )}
                    <Image
                      src={imageUrl.length ? imageUrl : NO_IMAGE_URL}
                      alt=""
                      height={400}
                      width={400}
                      className={`max-h-56 w-auto object-contain transition-opacity duration-300 ${isImageLoading ? "opacity-0" : "opacity-100"}`}
                      loading="eager"
                      onLoad={() => setIsImageLoading(false)}
                    />
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    {useFile && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-surface/90 backdrop-blur-sm text-ink border border-line hover:border-teal hover:text-teal transition-colors"
                      >
                        Replace
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearImage}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-surface/90 backdrop-blur-sm text-coral border border-coral/30 hover:bg-coral/10 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                useFile && (
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
                )
              )}

              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg"
                className="hidden"
                ref={(el) => { rhfFileRef(el); fileInputRef.current = el; }}
                {...fileRegister}
              />
              {errors.poster_file && (
                <p className="text-[11px] text-coral">{errors.poster_file.message as string}</p>
              )}

              {!!imageUrl && (
                <Field label="Poster alt text" error={errors.poster_alt?.message}>
                  <input
                    className={INPUT}
                    maxLength={100}
                    placeholder="Describe the image for screen readers"
                    {...register("poster_alt", {
                      maxLength: {
                        value: 100,
                        message: "Please limit the alt text to 100 characters.",
                      },
                      validate: {
                        validatePosterUrlImageAndAlt: (
                          poster_alt: string,
                          {
                            poster_url,
                            poster_file,
                          }: {
                            poster_url: string | null;
                            poster_file: File[] | null;
                          },
                        ) => {
                          if (!poster_url && !poster_file && poster_alt)
                            return "Please select an image to add as a poster.";
                          if ((poster_url || poster_file?.length) && !poster_alt)
                            return "For better accessibility, please describe this image.";
                          return true;
                        },
                      },
                    })}
                  />
                </Field>
              )}
            </div>

            {/* Recurrence toggle */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-[12px] font-semibold text-ink">Recurring event</p>
                <p className="text-[11px] text-muted">Repeat this event on a schedule.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="peer sr-only" {...register("is_recurring")} />
                <span className="w-10 h-6 rounded-full bg-line peer-checked:bg-teal transition-colors after:content-[''] after:absolute after:left-0.5 after:top-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
              </label>
            </div>

            {/* Recurrence builder */}
            {isRecurring && (
              <div className="flex flex-col gap-4 rounded-xl border border-line bg-canvas p-4">
                {/* Frequency */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-[12px] font-semibold text-ink">Repeats every</p>
                  <div className="flex items-center gap-2">
                    {frequency === "daily" && (
                      <input
                        className={INPUT + " w-20"}
                        type="number"
                        min={1}
                        placeholder="1"
                        {...register("recurrence_rule.interval")}
                      />
                    )}
                    <Controller
                      control={control}
                      name="recurrence_rule.frequency"
                      rules={{
                        required: {
                          value: isRecurring,
                          message:
                            "Please select how you want to set up the the frequency.",
                        },
                      }}
                      render={({ field }) => (
                        <select
                          className={INPUT + " w-auto cursor-pointer"}
                          {...field}
                          value={field.value ?? "daily"}
                        >
                          <option value="daily">Day(s)</option>
                          <option value="weekly">Week</option>
                          <option value="monthly">Month</option>
                        </select>
                      )}
                    />
                  </div>
                  {errors.recurrence_rule?.frequency && (
                    <p className="text-[11px] text-coral">
                      {errors.recurrence_rule?.frequency.message}
                    </p>
                  )}
                </div>

                {/* Monthly: by day vs by date */}
                {frequency === "monthly" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12px] font-semibold text-ink">
                      How should the recurrence be calculated?
                    </p>
                    <div className="flex gap-2">
                      <RadioPill
                        name="frequencyKind"
                        value="day"
                        checked={frequencyKind === "day"}
                        onChange={(v) => {
                          resetField("recurrence_rule.by_set_position", {
                            defaultValue: [],
                          });
                          setFrequencyKind(v);
                        }}
                        label="By day"
                      />
                      <RadioPill
                        name="frequencyKind"
                        value="date"
                        checked={frequencyKind === "date"}
                        onChange={(v) => {
                          resetField("recurrence_rule.by_month_day");
                          resetField("recurrence_rule.by_weekdays");
                          setFrequencyKind(v);
                        }}
                        label="By date"
                      />
                    </div>

                    {frequencyKind === "day" && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] text-muted">Repeat on the</p>
                        <div className="flex flex-wrap gap-2">
                          {frequencyKinds.map((kind) => (
                            <label key={kind.label} className="cursor-pointer">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                value={kind.value}
                                {...register("recurrence_rule.by_set_position", {
                                  required: {
                                    value: isRecurring && frequencyKind === "day",
                                    message:
                                      "Please select the week(s) you want this event to occur on.",
                                  },
                                })}
                              />
                              <span className={CHIP}>{kind.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {frequencyKind === "date" && (
                      <input
                        type="number"
                        className={INPUT}
                        placeholder="Enter a date of the month (between 1 & 31)"
                        {...register("recurrence_rule.by_month_day", {
                          required: {
                            value: isRecurring && frequencyKind === "date",
                            message:
                              "Please enter a date of month that you want this event to repeat on.",
                          },
                        })}
                        min={1}
                        max={31}
                      />
                    )}
                    {frequencyKind === "date" &&
                      byMonthDay &&
                      byMonthDay > 28 && (
                        <p className="text-[11px] text-coral">
                          Some months may not have {byMonthDay} days. In such
                          cases, an event may not be populated on that month.
                        </p>
                      )}
                  </div>
                )}

                {/* Weekday picker */}
                {(frequency === "weekly" ||
                  (frequency === "monthly" && frequencyKind === "day")) && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[12px] font-semibold text-ink">On these days</p>
                    <div className="flex flex-wrap gap-2">
                      {daysOfTheWeek.map((day) => (
                        <label key={day.label} className="cursor-pointer">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            value={day.value}
                            {...register("recurrence_rule.by_weekdays", {
                              required: {
                                value:
                                  isRecurring &&
                                  (frequency === "weekly" ||
                                    (frequency === "monthly" &&
                                      frequencyKind === "day")),
                                message:
                                  "Please select at least one day of the week that this event should repeat on.",
                              },
                            })}
                          />
                          <span className={CHIP}>{day.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {frequencyKind === "day" &&
                  errors.recurrence_rule?.by_set_position && (
                    <p className="text-[11px] text-coral">
                      {errors.recurrence_rule?.by_set_position.message}
                    </p>
                  )}
                {frequencyKind === "date" &&
                  errors.recurrence_rule?.by_month_day && (
                    <p className="text-[11px] text-coral">
                      {errors.recurrence_rule?.by_month_day.message}
                    </p>
                  )}
                {(frequency === "weekly" ||
                  (frequency === "monthly" && frequencyKind === "day")) &&
                  errors.recurrence_rule?.by_weekdays && (
                    <p className="text-[11px] text-coral">
                      {errors.recurrence_rule?.by_weekdays.message}
                    </p>
                  )}

                {/* Until / count */}
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] font-semibold text-ink">
                    Until when should it recur?
                  </p>
                  <div className="flex items-center gap-2">
                    <RadioPill
                      name="recurrenceType"
                      value="date"
                      checked={recurrenceType === "date"}
                      onChange={(v) => {
                        resetField("recurrence_rule.count");
                        setRecurrenceType(v);
                      }}
                      label="Until"
                    />
                    <RadioPill
                      name="recurrenceType"
                      value="count"
                      checked={recurrenceType === "count"}
                      onChange={(v) => {
                        resetField("recurrence_rule.until");
                        setRecurrenceType(v);
                      }}
                      label="For"
                    />
                    {recurrenceType === "date" && (
                      <input
                        className={INPUT + " flex-1"}
                        type="date"
                        suppressHydrationWarning
                        {...register("recurrence_rule.until", {
                          required: {
                            value: isRecurring && recurrenceType === "date",
                            message:
                              "You must select a date to terminate the recurrence.",
                          },
                          validate: {
                            validateRecursUntilTime: (
                              until,
                              { end_date }: { end_date: string | Date },
                            ) => {
                              const parsedDate = new Date(until ?? "");
                              const eventEndDate = new Date(end_date ?? "");
                              if (parsedDate < eventEndDate) {
                                return "The recurrence end date must be later than the event's end date.";
                              }
                              return true;
                            },
                          },
                        })}
                      />
                    )}
                    {recurrenceType === "count" && (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          className={INPUT}
                          type="number"
                          min={2}
                          max={20}
                          placeholder="2–20"
                          {...register("recurrence_rule.count", {
                            required: {
                              value: isRecurring && recurrenceType === "count",
                              message:
                                "Please indicate how many occurences you want to generate of this event.",
                            },
                          })}
                        />
                        <span className="text-[12px] text-muted whitespace-nowrap">occurrences</span>
                      </div>
                    )}
                  </div>
                  {recurrenceType === "date" &&
                    errors.recurrence_rule?.until && (
                      <p className="text-[11px] text-coral">
                        {errors.recurrence_rule.until.message}
                      </p>
                    )}
                  {recurrenceType === "count" &&
                    errors.recurrence_rule?.count && (
                      <p className="text-[11px] text-coral">
                        {errors.recurrence_rule.count.message}
                      </p>
                    )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-line">
            <div className="flex items-center gap-2">
              {event && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-coral border border-coral/30 hover:bg-coral/5 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                  </svg>
                  Delete
                </button>
              )}
              {event && (
                <Link
                  href={`/dashboard/events/${event.id}/posts`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-ink border border-line hover:bg-canvas transition-colors"
                  onClick={(e) => {
                    if ((isDirty || fileChangedRef.current) && !globalThis.confirm("Unsaved changes will be lost. Continue?")) {
                      e.preventDefault();
                      return;
                    }
                    closeModal(false);
                  }}
                >
                  Manage Posts
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
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
      {getConfirmation && (
        <ConfirmationModal
          message={message}
          buttons={buttons}
          closeModal={confirmAction}
        />
      )}
      {showDeleteConfirm && (
        <ConfirmationModal
          message={
            event?.is_recurring && event?.recurrence_rule_id
              ? "Which occurrences do you want to delete?"
              : "Are you sure you want to delete this event?"
          }
          buttons={
            event?.is_recurring && event?.recurrence_rule_id
              ? [
                  { value: "all", label: "All instances", variant: "danger" },
                  { value: "future", label: "This + future" },
                  { value: "this", label: "This occurrence" },
                  { value: "no", label: "Cancel" },
                ]
              : [
                  { value: "yes", label: "Yes, delete", variant: "danger" },
                  { value: "no", label: "Cancel" },
                ]
          }
          closeModal={handleDeleteConfirm}
        />
      )}
    </>
  );
}
