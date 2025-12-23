"use client";
import { Event } from "../schemas/events";
import { useForm, useWatch } from "react-hook-form";
import Image from "next/image";
import { ChangeEvent, useEffect, useState } from "react";
import { createEvent, editEvent } from "@/actions/events";
import { FIVE_MB, URL_REGEX } from "../constants/general";
import toast from "react-hot-toast";
import ConfirmationModal from "../../features/announcements/modals/ConfirmationModal";

interface EventModalProps {
  event?: Event;
  closeModal: (reloadEvents: boolean) => void;
}
function formatDateTimeLocal(date: string | Date | null): string {
  if (!date) return "";

  const dateObj = typeof date === "string" ? new Date(date) : date;
  // Get local date/time components
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
export default function EventModal({
  event,
  closeModal,
}: Readonly<EventModalProps>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
    reset,
    resetField,
    control,
  } = useForm<Event>({
    mode: "onChange",
  });

  const daysOfTheWeek = [
    { label: "Sun", value: "SU" },
    { label: "Mon", value: "MO" },
    { label: "Tue", value: "TU" },
    { label: "Wed", value: "WE" },
    { label: "Thu", value: "TH" },
    { label: "Fri", value: "FR" },
    { label: "Sat", value: "SA" },
  ];
  const frequencyKinds = [
    { label: "First", value: 1 },
    { label: "Second", value: 2 },
    { label: "Second Last", value: -2 },
    { label: "Last", value: -1 },
  ];

  const [imageUrl, setImageUrl] = useState<string | null>(
    event?.poster_url ?? null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [frequencyKind, setFrequencyKind] = useState<string>("day");
  const [recurrenceType, setRecurrenceType] = useState<string>("date");
  const [message, setMessage] = useState("");
  const [buttons, setButtons] = useState<{ label: string; value: string }[]>(
    []
  );
  const [useFile, setUseFile] = useState<boolean>(!event?.poster_url?.length);
  const [updatedEvent, setUpdatedEvent] = useState<Event | null>(null);
  const [getConfirmation, setGetConfirmation] = useState(false);
  const wasRecurring = event?.is_recurring ?? false;

  useEffect(() => {
    if (event) {
      reset({
        ...event,
        start_date: formatDateTimeLocal(event.start_date),
        end_date: formatDateTimeLocal(event.end_date),
        recurrence_rule: event.is_recurring
          ? {
              ...event.recurrence_rule,
              until: event.recurrence_rule?.until
                ? new Date(event.recurrence_rule.until).toLocaleDateString()
                : undefined,
            }
          : undefined,
      });
    } else {
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
  }, [event, reset]);

  const isRecurring = useWatch({ control, name: "is_recurring" });
  const frequency = useWatch({
    control,
    name: "recurrence_rule.frequency",
    defaultValue: "day",
  });
  const byMonthDay = useWatch({
    control,
    name: "recurrence_rule.by_month_day",
  });

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > FIVE_MB) {
        setError("poster_file", {
          message:
            "This file is too big. Please select an image file less than 5MB.",
        });
      } else if (
        !["image/png", "image/jpeg", "image/jpg"].includes(file.type)
      ) {
        setError("poster_file", {
          message:
            "This is an unsupported file type. Please upload a JPG/JPEG or PNG image.",
        });
      } else {
        setImageFile(file);
        setImageUrl(URL.createObjectURL(file));
      }
    } else {
      const url = event.target.value;
      if (url.length) {
        setImageUrl(url);
      } else {
        setImageFile(null);
        setImageUrl(null);
      }
      clearErrors(["poster_file", "poster_url"]);
    }
  };
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
        start_date: new Date(updatedEvent.start_date),
        end_date: new Date(updatedEvent.end_date),
        recurrence_rule: updatedEvent.is_recurring
          ? updatedEvent.recurrence_rule
          : undefined,
        action,
      });
      if (response.data?.error) {
        toast.error(response.data?.error);
      } else if (response.validationErrors) {
        toast.error(
          "There seems to be something wrong with the form. Please double check your inputs."
        );
        console.error(response.validationErrors);
      } else {
        toast.success(
          response.data?.statusText ?? "Event updated successfully!"
        );
        reset();
        setImageUrl(null);
        setImageFile(null);
        closeModal(true);
      }
    }
  }

  const onSubmit = async (data: Event) => {
    if (data.recurrence_rule) {
      if (data.recurrence_rule.frequency !== "day") {
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
          "This is a recurring event. Do you want to apply the changes to all instances, just this one, or this one and future instances?"
        );
        setButtons([
          { value: "all", label: "All" },
          { value: "single", label: "This One" },
          { value: "future", label: "This + Future" },
        ]);
        showConfirmationModal();
      } else if (!data.is_recurring && wasRecurring) {
        setMessage(
          "You have removed the recurrence rule. In effect, all other instances of this event will be removed. Do you want to continue?"
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
          start_date: new Date(data.start_date),
          end_date: new Date(data.end_date),
          recurrence_rule: data.is_recurring ? data.recurrence_rule : undefined,
          action: "single",
        });
        if (response.data?.error) {
          toast.error(response.data?.error);
        } else if (response.validationErrors) {
          toast.error(
            "There seems to be something wrong with the form. Please double check your inputs."
          );
          console.error(response.validationErrors, response);
        } else {
          toast.success(
            response.data?.statusText ?? "Event updated successfully!"
          );
          reset();
          setImageUrl(null);
          setImageFile(null);
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
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date),
        recurrence_rule: data.is_recurring ? data.recurrence_rule : undefined,
      });
      if (response.data?.error) {
        toast.error(response.data?.error);
      } else if (response.validationErrors) {
        toast.error(
          "There seems to be something wrong with the form. Please double check your inputs."
        );
        console.error(response.validationErrors);
      } else {
        toast.success(
          response.data?.statusText ?? "Event created successfully!"
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
  return (
    <>
      <div className="p-8 modal-box min-w-[calc(100dvw-100px)] h-[calc(100dvh-100px)]">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg">
            {event ? "Edit Event" : "Add new event"}
          </h3>
          <button
            className="btn btn-outline btn-error text-black"
            onClick={() => {
              reset();
              setImageUrl(null);
              setImageFile(null);
              closeModal(false);
            }}
          >
            Close Modal
          </button>
        </div>
        <div className="divider my-0"></div>
        <div className="modal-action my-0">
          <form
            className="grid grid-cols-3 w-full gap-2 text-lg "
            onSubmit={handleSubmit(onSubmit)}
          >
            <div className="col-span-2 grid gap-2">
              <input type="number" hidden {...register("id")} />
              <fieldset className="fieldset">
                <legend className="fieldset-legend mb-0 text-xl pb-0">
                  Title
                </legend>
                <input
                  className="input input-lg w-full rounded-2xl"
                  maxLength={50}
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
                        "Please make sure your title is at least 5 characters long.",
                    },
                  })}
                />
              </fieldset>
              {errors.title && (
                <span className="text-red-600" role="alert">
                  {errors.title.message}
                </span>
              )}
              <fieldset className="fieldset">
                <legend className="fieldset-legend mb-0 text-xl pb-0">
                  Description
                </legend>
                <input
                  className="input input-lg w-full rounded-2xl"
                  maxLength={100}
                  {...register("description", {
                    required: {
                      value: true,
                      message: "Please enter a description for the event.",
                    },
                    maxLength: {
                      value: 100,
                      message:
                        "Please limit your description to less than 100 characters long.",
                    },
                    minLength: {
                      value: 20,
                      message:
                        "Please make sure your description is at least 20 characters long.",
                    },
                  })}
                />
              </fieldset>
              {errors.description && (
                <span className="text-red-600" role="alert">
                  {errors.description.message}
                </span>
              )}
              <div className={`w-full gap-2`}>
                <fieldset className="fieldset relative">
                  <legend className="fieldset-legend mb-0 text-xl pb-0 w-full">
                    <div className="flex justify-between w-full items-baseline">
                      <span>Poster</span>
                      <span className="text-sm text-error-content pb-0">
                        In the event that an image file and a url are presented,
                        the image file will take precedence.
                      </span>
                      <label className="toggle toggle-lg text-base-content p-0">
                        <input
                          type="checkbox"
                          checked={useFile}
                          onChange={() => setUseFile(!useFile)}
                        />
                        <span
                          className="text-xs flex items-center"
                          aria-label="enabled"
                        >
                          URL
                        </span>
                        <span
                          className="text-xs flex items-center"
                          aria-label="disabled"
                        >
                          FILE
                        </span>
                      </label>
                    </div>
                  </legend>
                  {useFile ? (
                    <input
                      {...register("poster_file")}
                      type="file"
                      accept="image/png, image/jpeg, image/jpg"
                      className="input input-lg hover:cursor-pointer rounded-2xl w-full"
                      onChange={handleImageChange}
                    />
                  ) : (
                    <input
                      {...register("poster_url")}
                      type="url"
                      className="input input-lg w-full rounded-2xl"
                      onChange={handleImageChange}
                    />
                  )}
                </fieldset>

                <fieldset className="fieldset grow">
                  <legend className="fieldset-legend mb-0 text-xl pb-0">
                    Poster Alt Text
                  </legend>
                  <input
                    className="w-full input input-lg rounded-2xl"
                    maxLength={100}
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
                          }
                        ) => {
                          if (!poster_url && !poster_file && poster_alt)
                            return "Please select an image to add as a poster.";
                          if (
                            (poster_url || poster_file?.length) &&
                            !poster_alt
                          )
                            return "For better accessibility, please describe this image.";
                          return true;
                        },
                      },
                    })}
                  />
                </fieldset>
              </div>
              {errors.poster_alt && (
                <span className="text-red-600" role="alert">
                  {errors.poster_alt.message}
                </span>
              )}
              <fieldset className="fieldset">
                <legend className="fieldset-legend mb-0 text-xl pb-0">
                  Call To Action Button Link
                </legend>
                <input
                  className="w-full input input-lg rounded-2xl"
                  {...register("call_to_action_link", {
                    pattern: {
                      value: URL_REGEX,
                      message:
                        'Please enter a valid URL. Make sure it begins with "https://" and does not have any leading or trailing spaces.',
                    },
                    validate: {
                      validateCallToActionLink: (
                        call_to_action_link: string | null,
                        {
                          call_to_action_caption,
                        }: {
                          call_to_action_caption: string;
                        }
                      ) => {
                        if (!call_to_action_link && call_to_action_caption) {
                          return "Please add a link for the call to action button, or remove the caption.";
                        }
                        return true;
                      },
                    },
                  })}
                />
              </fieldset>
              {errors.call_to_action_link && (
                <span className="text-red-600" role="alert">
                  {errors.call_to_action_link.message}
                </span>
              )}
              <fieldset className="fieldset">
                <legend className="fieldset-legend mb-0 text-xl pb-0">
                  Call To Action Caption
                </legend>
                <input
                  className="w-full input input-lg rounded-2xl"
                  maxLength={20}
                  {...register("call_to_action_caption", {
                    maxLength: {
                      value: 20,
                      message: "Please limit the button text to 20 characters",
                    },
                    validate: {
                      validateCallToActionCaption: (
                        call_to_action_caption: string,
                        {
                          call_to_action_link,
                        }: {
                          call_to_action_link: string | null;
                        }
                      ) => {
                        if (call_to_action_link && !call_to_action_caption) {
                          return "Please add a caption for the call to action button, or remove the link.";
                        }
                        return true;
                      },
                    },
                  })}
                />
              </fieldset>
              {errors.call_to_action_caption && (
                <legend className="text-red-600" role="alert">
                  {errors.call_to_action_caption.message}
                </legend>
              )}
              <div className="flex">
                <fieldset className="fieldset grow">
                  <legend className="fieldset-legend mb-0 text-xl pb-0">
                    Start Date
                  </legend>
                  <input
                    className="w-full input input-lg rounded-2xl"
                    type="datetime-local"
                    {...register("start_date", {
                      required: {
                        value: true,
                        message:
                          "Please specify a start date and time for this event.",
                      },
                      validate: {
                        validateStartDate: (
                          start_date: string | Date,
                          {
                            end_date,
                          }: {
                            end_date: string | Date;
                          }
                        ) => {
                          if (end_date && start_date > end_date) {
                            return "You cannot set the start datetime to be after the end datetime.";
                          }
                          return true;
                        },
                      },
                    })}
                  />
                </fieldset>
                <fieldset className="fieldset grow">
                  <legend className="fieldset-legend mb-0 text-xl pb-0">
                    Ends At
                  </legend>
                  <input
                    className="w-full input input-lg rounded-2xl"
                    type="datetime-local"
                    {...register("end_date", {
                      required: {
                        value: true,
                        message:
                          "Please specify an end date and time for this event.",
                      },
                      validate: {
                        validateEndDate: (
                          end_date: string | Date,
                          {
                            start_date,
                          }: {
                            start_date: string | Date;
                          }
                        ) => {
                          if (start_date && start_date > end_date) {
                            return "You cannot set the end datetime to be before the start datetime.";
                          }
                          return true;
                        },
                      },
                    })}
                  />
                </fieldset>
              </div>
              <div>
                {errors.start_date && (
                  <span className="text-red-600" role="alert">
                    {errors.start_date.message}
                  </span>
                )}
                {errors.end_date && !errors.start_date && (
                  <span className="text-red-600" role="alert">
                    {errors.end_date.message}
                  </span>
                )}
              </div>
              <div>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend mb-0 text-xl pb-0">
                    Recurrence
                  </legend>
                  <input
                    type="checkbox"
                    {...register("is_recurring")}
                    className="toggle toggle-xl transition-all duration-300 border-red-600 bg-red-500 checked:border-green-500 checked:bg-green-400 checked:text-green-800"
                  />
                </fieldset>
              </div>
              <div
                className={`${
                  frequency && isRecurring
                    ? (frequency === "day"
                        ? "h-60"
                        : frequency === "week"
                        ? "h-80"
                        : frequencyKind === "date"
                        ? "h-100"
                        : "h-120") + " opacity-100"
                    : "h-0 opacity-0"
                } transform duration-300 gap-3 w-full`}
              >
                {/**/}
                <fieldset className="fieldset bg-base-200 border-base-300 rounded-box border p-4 text-xl">
                  <legend className="fieldset-legend">
                    How do you want to set up the recurrence?
                  </legend>

                  {
                    <div className="flex gap-3 justify-start items-center">
                      <span>Every</span>
                      {frequency && frequency === "day" && (
                        <>
                          <input
                            className="input input-lg rounded-2xl"
                            type="number"
                            min={1}
                            placeholder="1"
                            {...register("recurrence_rule.interval")}
                          />
                        </>
                      )}
                      <select
                        className="select select-lg rounded-2xl"
                        {...register("recurrence_rule.frequency", {
                          required: {
                            value: isRecurring,
                            message:
                              "Please select how you want to set up the the frequency.",
                          },
                        })}
                      >
                        <option value="day">Day(s)</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                      </select>
                    </div>
                  }
                  {errors.recurrence_rule?.frequency && (
                    <p className="text-red-500">
                      {errors.recurrence_rule?.frequency.message}
                    </p>
                  )}
                  {frequency && ["month", "year"].includes(frequency) && (
                    <fieldset className="mt-3 fieldset text-lg">
                      <legend className="fieldset-legend">
                        How do you want the recurrence to be calculated?
                      </legend>
                      <fieldset className="fieldset flex text-lg gap-3">
                        <label>
                          <input
                            className="radio radio-lg"
                            type="radio"
                            name="frequencyKind"
                            value="day"
                            checked={frequencyKind === "day"}
                            onChange={(e) => {
                              resetField("recurrence_rule.by_set_position", {
                                defaultValue: [],
                              });
                              setFrequencyKind(e.target.value);
                            }}
                          />
                          By day
                        </label>
                        <label>
                          <input
                            className="radio radio-lg"
                            type="radio"
                            name="frequencyKind"
                            value="date"
                            checked={frequencyKind === "date"}
                            onChange={(e) => {
                              resetField("recurrence_rule.by_month_day");
                              resetField("recurrence_rule.by_weekdays");
                              setFrequencyKind(e.target.value);
                            }}
                          />
                          By date
                        </label>
                      </fieldset>

                      {frequencyKind === "day" && (
                        <fieldset className="fieldset grid grid-cols-5 items-center text-lg gap-3">
                          Repeat on the
                          {frequencyKinds.map((kind) => {
                            return (
                              <input
                                {...register(
                                  "recurrence_rule.by_set_position",
                                  {
                                    required: {
                                      value:
                                        isRecurring && frequencyKind === "day",
                                      message:
                                        "Please select the week(s) you want this event to occur on.",
                                    },
                                  }
                                )}
                                key={kind.label}
                                className="btn btn-lg border-gray-100 rounded-2xl checked:btn-success checked:border-0"
                                type="checkbox"
                                aria-label={kind.label}
                                value={kind.value}
                              />
                            );
                          })}
                        </fieldset>
                      )}
                      {frequencyKind === "date" && (
                        <input
                          type="number"
                          className="input input-lg rounded-2xl w-full"
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
                          <p className="text-red-600">
                            Some months may not have {byMonthDay} days. In such
                            cases, an event may not be populated on that month.
                          </p>
                        )}
                    </fieldset>
                  )}
                  {frequency &&
                    (frequency === "week" ||
                      (frequency === "month" && frequencyKind === "day")) && (
                      <fieldset className="pb-3 grid grid-cols-7 gap-3">
                        {daysOfTheWeek.map((day) => {
                          return (
                            <input
                              {...register("recurrence_rule.by_weekdays", {
                                required: {
                                  value:
                                    isRecurring &&
                                    (frequency === "week" ||
                                      (frequency === "month" &&
                                        frequencyKind === "day")),
                                  message:
                                    "Please select at least one day of the week that this event should repeat on.",
                                },
                              })}
                              key={day.label}
                              className="btn btn-lg border-gray-100 rounded-2xl checked:btn-success checked:border-0"
                              type="checkbox"
                              aria-label={day.label}
                              value={day.value}
                            />
                          );
                        })}
                      </fieldset>
                    )}
                  {frequencyKind === "day" &&
                    errors.recurrence_rule?.by_set_position && (
                      <p className="text-red-500">
                        {errors.recurrence_rule?.by_set_position.message}
                      </p>
                    )}
                  {frequencyKind === "date" &&
                    errors.recurrence_rule?.by_month_day && (
                      <p className="text-red-500">
                        {errors.recurrence_rule?.by_month_day.message}
                      </p>
                    )}
                  {(frequency === "week" ||
                    (frequency === "month" && frequencyKind === "day")) &&
                    errors.recurrence_rule?.by_weekdays && (
                      <p className="text-red-500">
                        {errors.recurrence_rule?.by_weekdays.message}
                      </p>
                    )}
                  <fieldset className="fieldset text-lg">
                    <legend className="fieldset-legend">
                      Till when do you want the event to recur?
                    </legend>
                    <div className="flex justify-between">
                      <div className="flex-1 flex gap-3">
                        <label>
                          <input
                            className="radio radio-lg"
                            type="radio"
                            name="recurrenceType"
                            value="date"
                            checked={recurrenceType === "date"}
                            onChange={(e) => {
                              resetField("recurrence_rule.count");
                              setRecurrenceType(e.target.value);
                            }}
                          />
                          Until
                        </label>
                        <label>
                          <input
                            className="radio radio-lg"
                            type="radio"
                            name="recurrenceType"
                            value="count"
                            checked={recurrenceType === "count"}
                            onChange={(e) => {
                              resetField("recurrence_rule.until");
                              setRecurrenceType(e.target.value);
                            }}
                          />
                          For
                        </label>
                      </div>
                      <div className="flex-2 flex gap-3">
                        {recurrenceType === "date" && (
                          <input
                            className="input input-lg rounded-2xl w-full"
                            type="date"
                            {...register("recurrence_rule.until", {
                              required: {
                                value: isRecurring && recurrenceType === "date",
                                message:
                                  "You must select a date to terminate the recurrence.",
                              },
                              validate: {
                                validateRecursUntilTime: (
                                  until,
                                  {
                                    end_date,
                                  }: {
                                    end_date: string | Date;
                                  }
                                ) => {
                                  const parsedDate = new Date(until ?? "");
                                  const eventEndDate = new Date(end_date ?? "");
                                  if (
                                    parsedDate.toLocaleDateString() <
                                    eventEndDate.toLocaleDateString()
                                  ) {
                                    return "The recurrence end date must be later than the event's end date.";
                                  }
                                  return true;
                                },
                              },
                            })}
                          />
                        )}
                        {recurrenceType === "count" && (
                          <label className="w-full label">
                            <input
                              className="w-full input input-lg rounded-2xl"
                              type="number"
                              min={2}
                              max={20}
                              placeholder="Enter a number between 2 and 20"
                              {...register("recurrence_rule.count", {
                                required: {
                                  value:
                                    isRecurring && recurrenceType === "count",
                                  message:
                                    "Please indicate how many occurences you want to generate of this event.",
                                },
                              })}
                            />
                            occurences
                          </label>
                        )}
                      </div>
                    </div>
                    {recurrenceType === "date" &&
                      errors.recurrence_rule?.until && (
                        <p className="text-red-500">
                          {errors.recurrence_rule.until.message}
                        </p>
                      )}
                    {recurrenceType === "count" &&
                      errors.recurrence_rule?.count && (
                        <p className="text-red-500">
                          {errors.recurrence_rule.count.message}
                        </p>
                      )}
                  </fieldset>
                </fieldset>
              </div>
              <button className="btn btn-success z-10" type="submit">
                Submit
              </button>
            </div>
            <div className="relative flex flex-1 justify-center items-center col-span-1">
              <Image
                src={
                  imageUrl?.length
                    ? imageUrl
                    : "https://gkpctbvyswcfccogoepl.supabase.co/storage/v1/object/public/event-posters/public/NO%20IMAGE.png"
                }
                alt=""
                height="500"
                width="500"
                loading="eager"
              />
              {(imageUrl || imageFile) && (
                <button
                  onClick={() => {
                    reset({
                      poster_file: [],
                      poster_url: null,
                      poster_alt: "",
                    });
                    setImageFile(null);
                    setImageUrl(null);
                  }}
                  className="absolute btn btn-xs btn-soft btn-error top-2 right-2"
                >
                  Clear Image
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
      {getConfirmation && (
        <ConfirmationModal
          message={message}
          buttons={buttons}
          closeModal={confirmAction}
        />
      )}
    </>
  );
}
