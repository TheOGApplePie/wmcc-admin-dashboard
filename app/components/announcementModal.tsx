"use client";
import { Announcement } from "../schemas/announcement";
import { useForm } from "react-hook-form";
import Image from "next/image";
import { ChangeEvent, useState } from "react";
import { createAnnouncement } from "@/actions/announcements";
import { FIVE_MB, URL_REGEX } from "../constants/general";
import toast from "react-hot-toast";

interface AnnouncementModalProps {
  announcement?: Announcement;
  closeModal: () => void;
}

export function AnnouncementModal({
  announcement,
  closeModal,
}: AnnouncementModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Announcement>({
    mode: "onBlur",
    defaultValues: announcement,
  });

  const [imageUrl, setImageUrl] = useState<string | null>(
    announcement?.poster_url ?? null,
  );
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > FIVE_MB) {
        useForm().setError("poster_file", {
          message:
            "This file is too big. Please select an image file less than 5MB.",
        });
      } else if (
        !["image/png", "image/jpeg", "image/jpg"].includes(file.type)
      ) {
        useForm().setError("poster_file", {
          message:
            "This is an unsupported file type. Please upload a JPG/JPEG or PNG image.",
        });
      } else {
        setImageFile(file);
        setImageUrl(URL.createObjectURL(file));
      }
    } else {
      setImageFile(null);
      setImageUrl(null);
      useForm().clearErrors(["poster_file", "poster_url"]);
    }
  };
  async function onSubmit(data) {
    console.log(data);
    const response = await createAnnouncement(data);
    if (response.data?.error) {
      toast.error(response.data?.error);
    } else if (response.validationErrors) {
      console.log(response.validationErrors);
    } else {
      toast.success(response.data?.statusText!);
      closeModal();
    }
  }
  return (
    <div className="p-8 modal-box min-w-[calc(100dvw-100px)] h-[calc(100dvh-200px)]">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">
          {announcement ? "Edit Announcement" : "Add new announcement"}
        </h3>
        <button
          className="btn btn-ghost btn-error text-black"
          onClick={() => {
            reset();
            setImageUrl(null);
            setImageFile(null);
            closeModal();
          }}
        >
          X
        </button>
      </div>
      <div className="divider"></div>
      <div className="modal-action my-0">
        <form
          className="grid grid-cols-3 w-full gap-2 text-lg "
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="col-span-2 grid gap-2">
            <input type="number" hidden {...register("id")} />
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Title</legend>
              <input
                className="input input-lg w-full"
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
              <legend className="fieldset-legend">Description</legend>
              <input
                className="input input-lg w-full"
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
            <div
              className={`w-full flex ${imageUrl && !imageUrl.includes("blob") ? "flex-col" : ""} gap-2`}
            >
              {imageUrl && !imageUrl.includes("blob") ? (
                <fieldset className="fieldset relative">
                  <legend className="fieldset-legend">Poster</legend>
                  <input
                    {...register("poster_url")}
                    type="url"
                    className="input input-lg w-full hover:cursor-pointer"
                    onChange={handleImageChange}
                  />
                  <span
                    onClick={() => {
                      reset({
                        poster_file: [],
                        poster_url: null,
                        poster_alt: "",
                      });
                      setImageFile(null);
                      setImageUrl(null);
                    }}
                    className="absolute btn btn-xs btn-soft btn-error top-0 right-1"
                  >
                    X
                  </span>
                </fieldset>
              ) : (
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Poster</legend>
                  <input
                    {...register("poster_file")}
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    className="input input-lg hover:cursor-pointer"
                    onChange={handleImageChange}
                  />
                </fieldset>
              )}

              <fieldset className="fieldset">
                <legend className="fieldset-legend">Poster Alt Text</legend>
                <input
                  className="w-full input input-lg"
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
              </fieldset>
            </div>
            {errors.poster_alt && (
              <span className="text-red-600" role="alert">
                {errors.poster_alt.message}
              </span>
            )}
            <fieldset className="fieldset">
              <legend className="fieldset-legend">
                Call To Action Button Link
              </legend>
              <input
                className="w-full input input-lg"
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
                      },
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
              <legend className="fieldset-legend">
                Call To Action Caption
              </legend>
              <input
                className="w-full input input-lg"
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
                      },
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
              <legend className="fieldset-legend">Expires At</legend>
              <input
                className="w-full input input-lg"
                type="datetime-local"
                {...register("expires_at", {
                  required: {
                    value: true,
                    message:
                      "Please specify an end date and time for this announcement.",
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
          <div className="relative flex justify-center items-center col-span-1">
            <Image
              src={
                imageUrl ||
                "https://gkpctbvyswcfccogoepl.supabase.co/storage/v1/object/public/event-posters/public/NO%20IMAGE.png"
              }
              alt=""
              height={300}
              width={300}
            />
            {(imageUrl || imageFile) && (
              <span
                onClick={() => {
                  reset({
                    poster_file: [],
                    poster_url: null,
                    poster_alt: "",
                  });
                  setImageFile(null);
                  setImageUrl(null);
                }}
                className="absolute btn btn-xs btn-soft btn-error top-0 right-1"
              >
                X
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
