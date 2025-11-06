"use client";
import { Announcement } from "../schemas/announcement";
import { useForm } from "react-hook-form";
import Image from "next/image";
import { ChangeEvent, useEffect, useState } from "react";
import { createAnnouncement } from "@/actions/announcements";
import { FIVE_MB, URL_REGEX } from "../constants/general";
import toast from "react-hot-toast";

interface AnnouncementModalProps {
  announcement?: Announcement;
  closeModal: (reloadAnnouncements: boolean) => void;
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
export function AnnouncementModal({
  announcement,
  closeModal,
}: Readonly<AnnouncementModalProps>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
    reset,
  } = useForm<Announcement>({
    mode: "onChange",
  });

  const [imageUrl, setImageUrl] = useState<string | null>(
    announcement?.poster_url ?? null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [useFile, setUseFile] = useState<boolean>(
    !announcement?.poster_url?.length
  );

  useEffect(() => {
    if (announcement) {
      reset({
        ...announcement,
        expires_at: formatDateTimeLocal(announcement.expires_at),
      });
      setImageUrl(announcement.poster_url ?? null);
      setUseFile(!announcement.poster_url?.length);
    } else {
      reset({
        id: undefined,
        title: "",
        description: "",
        poster_url: null,
        poster_alt: "",
        poster_file: [],
        call_to_action_link: "",
        call_to_action_caption: "",
        expires_at: new Date(),
      });
      setImageUrl(null);
      setUseFile(true);
    }
    setImageFile(null);
  }, [announcement, reset]);
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
  async function onSubmit(data: Announcement) {
    console.log(data);
    const response = await createAnnouncement({
      id: data.id,
      call_to_action_caption: data.call_to_action_caption,
      title: data.title,
      description: data.description,
      poster_url: data.poster_url?.length ? data.poster_url : null,
      poster_alt: data.poster_alt ?? null,
      poster_file: data.poster_file ?? [],
      call_to_action_link: data.call_to_action_link ?? null,
      expires_at: new Date(data.expires_at).toISOString(),
    });
    if (response.data?.error) {
      toast.error(response.data?.error);
    } else if (response.validationErrors) {
      console.log(response.validationErrors);
    } else {
      toast.success(
        response.data?.statusText ?? "Announcement created successfully!"
      );
      reset();
      setImageUrl(null);
      setImageFile(null);
      closeModal(true);
    }
  }
  return (
    <div className="p-8 modal-box min-w-[calc(100dvw-100px)] h-[calc(100dvh-200px)]">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">
          {announcement ? "Edit Announcement" : "Add new announcement"}
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
                    message: "Please enter a title for the announcement.",
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
                    message: "Please enter a description for the announcement.",
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
                      <span className="text-xs" aria-label="enabled">
                        URL
                      </span>
                      <span className="text-xs" aria-label="disabled">
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
                        if ((poster_url || poster_file?.length) && !poster_alt)
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
                      call_to_action_link: string,
                      {
                        call_to_action_caption,
                      }: {
                        call_to_action_caption: string | null;
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
            <fieldset className="fieldset">
              <legend className="fieldset-legend mb-0 text-xl pb-0">
                Expires At
              </legend>
              <input
                className="w-full input input-lg"
                type="datetime-local"
                min={formatDateTimeLocal(new Date())}
                {...register("expires_at", {
                  required: {
                    value: true,
                    message:
                      "Please specify an end date and time for this announcement.",
                  },
                  validate: {
                    validateExpiresTime: (expires_at: string | Date) => {
                      const parsedDate = new Date(expires_at);
                      const now = new Date();
                      if (parsedDate < now) {
                        return "You cannot set the datetime of expiry to be a datetime in the past.";
                      }
                      return true;
                    },
                  },
                })}
              />
            </fieldset>
            {errors.expires_at && (
              <span className="text-red-600" role="alert">
                {errors.expires_at.message}
              </span>
            )}
            <button className="btn btn-success" type="submit">
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
  );
}
