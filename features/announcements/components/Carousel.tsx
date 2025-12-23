"use client";
import { useState } from "react";
import { Announcement } from "../../../app/schemas/announcement";
import Image from "next/image";
import Link from "next/link";
import EditButton from "./EditButton";
import DeleteButton from "./DeleteButton";
import AddButton from "./AddButton";

interface CarouselProps {
  announcements: Announcement[] | null;
}

export default function Carousel({ announcements }: Readonly<CarouselProps>) {
  const [index, setIndex] = useState(0);

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

  return (
    <>
      <div className="w-full text-white">
        <div className="flex relative items-center">
          {!announcements?.length && (
            <div className="w-full text-3xl p-10">
              There are no announcements setup yet. Press the add button on the
              top right to begin adding announcements.
            </div>
          )}
          {announcements?.map((announcement, announcementIndex) => (
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
                  announcement.poster_url ? "hidden @lg:flex" : "flex"
                } flex-col flex-1 text-center items-center justify-start px-20`}
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
        {!!announcements?.length && announcements?.length > 1 && (
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
          <AddButton />
          {!!announcements?.length && announcements[index] && (
            <>
              <EditButton announcement={announcements[index]} />
              <DeleteButton announcement={announcements[index]} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
