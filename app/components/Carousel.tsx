"use client";
import { useState } from "react";
import { Announcement } from "../schemas/announcement";
import Image from "next/image";
import { AnnouncementModal } from "./announcementModal";
import {
  deleteAnnouncement,
  fetchAnnouncements,
} from "../../actions/announcements";
import ConfirmationModal from "./confirmationModal";
import { ResponseCodes } from "../enums/responseCodes";
import Link from "next/link";

interface CarouselProps {
  announcements: Announcement[] | null;
}
function handleDeleteAnnouncement() {
  (document.getElementById("delete-modal") as HTMLDialogElement).showModal();
}
export default function Carousel({ announcements }: Readonly<CarouselProps>) {
  const [index, setIndex] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<
    Announcement | undefined
  >(undefined);
  const [updatedAnnouncements, setUpdatedAnnouncements] = useState<
    Announcement[] | null
  >(announcements);

  function incrementCount() {
    if (updatedAnnouncements?.length) {
      setIndex(index + 1 > updatedAnnouncements.length - 1 ? 0 : index + 1);
    }
  }

  function decrementCount() {
    if (updatedAnnouncements?.length) {
      setIndex(index - 1 < 0 ? updatedAnnouncements.length - 1 : index - 1);
    }
  }

  function openModal(announcement?: Announcement) {
    setSelectedAnnouncement(announcement);
    (
      document.getElementById("add-edit-modal") as HTMLDialogElement
    ).showModal();
  }

  async function closeModal(reloadAnnouncements = true) {
    (document.getElementById("add-edit-modal") as HTMLDialogElement).close();
    if (reloadAnnouncements) {
      const announcements = (await fetchAnnouncements()).data?.data;
      setUpdatedAnnouncements(announcements ?? null);
    }
  }
  async function confirmDeleteAnnouncement(confirmAction: boolean) {
    if (confirmAction) {
      const deletedAnnouncement = await deleteAnnouncement({
        id: updatedAnnouncements?.[index].id,
      });
      if (deletedAnnouncement.data?.status !== ResponseCodes.SUCCESS) {
        console.error(deletedAnnouncement.data?.error);
      }
    }
    (document.getElementById("delete-modal") as HTMLDialogElement).close();
    const announcements = await fetchAnnouncements();
    setUpdatedAnnouncements(announcements.data?.data ?? null);
  }
  return (
    <>
      <div className="w-full text-white">
        <div className="flex relative items-center">
          {!updatedAnnouncements?.length && (
            <div className="w-full text-3xl justify-center flex">
              There are no announcements setup yet. Press the add button on the
              top right to begin adding announcements.
            </div>
          )}
          {updatedAnnouncements?.map((announcement, announcementIndex) => (
            <div
              key={announcement.id}
              id={`slide${announcementIndex}`}
              className={`absolute w-full flex items-center justify-center transform duration-500 ${
                index === announcementIndex
                  ? "opacity-100 translate-x-0"
                  : index < announcementIndex
                  ? "translate-x-full opacity-0"
                  : "-translate-x-full opacity-0"
              }`}
            >
              <div
                className={`${
                  announcement.poster_url ? "hidden @lg:" : ""
                }flex flex-col flex-1 text-center items-center justify-start px-20`}
              >
                <h1>{announcement.title}</h1>
                <h3>{announcement.description}</h3>
                {announcement.call_to_action_link && (
                  <button className="bg-(--main-colour-blue) hover:bg-(--secondary-colour-green) text-white font-semibold my-6 py-3 px-6 rounded-lg transition-colors duration-300 shadow-lg">
                    <Link
                      href={announcement.call_to_action_link}
                      target="_blank"
                    >
                      {announcement.call_to_action_caption}
                    </Link>
                  </button>
                )}
              </div>
              {announcement.poster_url && (
                <div className="flex flex-col flex-1 items-center justify-center px-20">
                  <Image
                    src={announcement.poster_url}
                    alt={announcement.poster_alt || announcement.title}
                    height="400"
                    width="400"
                  />
                  <button
                    className={`${
                      announcement.call_to_action_link
                        ? "block @lg:hidden"
                        : "hidden"
                    } bg-(--main-colour-blue) hover:bg-(--secondary-colour-green) text-white font-semibold my-6 py-3 px-6 rounded-lg transition-colors duration-300 shadow-lg`}
                  >
                    <Link
                      href={announcement.call_to_action_link}
                      target="_blank"
                    >
                      {announcement.call_to_action_caption}
                    </Link>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {updatedAnnouncements?.length && (
          <div className="absolute left-5 right-5 top-1/2 flex -translate-y-1/2 transform justify-between">
            <button
              className="btn btn-circle"
              onClick={() => {
                decrementCount();
              }}
            >
              ❮
            </button>
            <button
              className="btn btn-circle"
              onClick={() => {
                incrementCount();
              }}
            >
              ❯
            </button>
          </div>
        )}
        <div className="flex flex-col absolute right-5 top-20 gap-2">
          <button
            className="btn btn-success"
            onClick={() => {
              openModal();
            }}
          >
            + Add
          </button>
          {!!updatedAnnouncements?.length && (
            <>
              <button
                className="btn btn-neutral"
                onClick={() => {
                  openModal(updatedAnnouncements[index]);
                }}
              >
                Edit
              </button>
              <button
                className="btn btn-error"
                onClick={() => {
                  handleDeleteAnnouncement();
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      <dialog id="add-edit-modal" className="modal">
        <AnnouncementModal
          key={selectedAnnouncement?.id || "new"}
          announcement={selectedAnnouncement}
          closeModal={() => {
            closeModal();
          }}
        />
      </dialog>
      <dialog id="delete-modal" className="modal">
        <ConfirmationModal closeModal={confirmDeleteAnnouncement} />
      </dialog>
    </>
  );
}
