"use client";
import { useState } from "react";
import { Announcement } from "../schemas/announcement";
import Image from "next/image";
import { AnnouncementModal } from "./announcementModal";

interface CarouselProps {
  announcements: Announcement[] | null;
}
export default function Carousel({ announcements }: Readonly<CarouselProps>) {
  const [index, setIndex] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<
    Announcement | undefined
  >(undefined);

  if (!announcements) {
    return <>There are no announcements set up yet.</>;
  }
  function incrementCount() {
    if (announcements?.length) {
      setIndex(index + 1 > announcements.length - 1 ? 0 : index + 1);
    }
  }

  function decrementCount() {
    if (announcements?.length) {
      setIndex(index - 1 < 0 ? announcements.length - 1 : index - 1);
    }
  }

  function openModal(announcement?: Announcement) {
    setSelectedAnnouncement(announcement);
    (
      document.getElementById("add-edit-modal") as HTMLDialogElement
    ).showModal();
  }

  function closeModal() {
    (document.getElementById("add-edit-modal") as HTMLDialogElement).close();
  }

  return (
    <>
      <div className="w-full text-white">
        <div className="flex relative items-center">
          {announcements.map((announcement, announcementIndex) => (
            <div
              key={announcement.id}
              id={`slide${announcementIndex}`}
              className={`absolute w-full flex items-center justify-center transform duration-500 ${index === announcementIndex ? "opacity-100 translate-x-0" : index < announcementIndex ? "translate-x-full opacity-0" : "-translate-x-full opacity-0"}`}
            >
              <div className="flex flex-col flex-1 text-center items-center justify-start px-20">
                <h1>{announcement.title}</h1>
                <h3>{announcement.description}</h3>
              </div>
              {announcement.poster_url ? (
                <div className="flex flex-1 items-center justify-center px-20">
                  <Image
                    src={announcement.poster_url}
                    alt={announcement.poster_alt || announcement.title}
                    height="400"
                    width="400"
                  />
                </div>
              ) : (
                <></>
              )}
            </div>
          ))}
        </div>
        <div className="absolute left-5 right-5 top-1/2 flex -translate-y-1/2 transform justify-between">
          <button
            // href={`#slide${index - 1 < 0 ? announcements.length - 1 : index - 1}`}
            className="btn btn-circle"
            onClick={() => {
              decrementCount();
            }}
          >
            ❮
          </button>
          <button
            // href={`#slide${index + 1 > announcements.length - 1 ? 0 : announcements.length - 1}`}
            className="btn btn-circle"
            onClick={() => {
              incrementCount();
            }}
          >
            ❯
          </button>
        </div>
        <div className="flex flex-col absolute right-5 top-20 gap-2">
          {announcements.length ? (
            <button
              className="btn btn-neutral"
              onClick={() => {
                openModal(announcements[index]);
              }}
            >
              Edit
            </button>
          ) : (
            <></>
          )}
          <button
            className="btn btn-success"
            onClick={() => {
              openModal();
            }}
          >
            + Add
          </button>
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
    </>
  );
}
