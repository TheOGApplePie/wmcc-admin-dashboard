"use client";
import { useState } from "react";
import { Announcement } from "../interfaces/announcement";
import Image from "next/image";
interface CarouselProps {
  announcements: Announcement[] | null;
}
export default function Carousel({ announcements }: Readonly<CarouselProps>) {
  const [index, setIndex] = useState(0);
  if (!announcements) {
    return <>There are no announcements set up yet.</>;
  }
  function incrementCount() {
    if (announcements?.length) {
      setIndex((index + 1) % announcements.length);
    }
  }
  function decrementCount() {
    if (announcements?.length) {
      setIndex((index - 1 + announcements.length) % announcements.length);
    }
  }
  return (
    <>
      <div className="overflow-hidden relative">
        {announcements.map((announcement, i) => (
          <div
            key={announcement.id}
            className={`grid grid-cols-1 sm:grid-cols-2 absolute inset-0 transition-all duration-500 ease-out transform ${
              index === i
                ? "opacity-100 translate-x-0"
                : i < index
                ? "opacity-100 -translate-x-full"
                : "opacity-100 translate-x-full"
            } carousel-item`}
          >
            {/* Caption - Left side, centered */}
            <div className="col-span-1 hidden sm:flex sm:flex-col sm:items-center sm:justify-center p-8">
              <div className="text-center max-w-md mb-6">
                <h1 className="text-3xl font-bold text-white mb-4">
                  {announcement.title}
                </h1>
                <h3 className="text-xl font-bold text-white mb-4">
                  {announcement.description}
                </h3>
              </div>
              {announcement.call_to_action_link &&
                announcement.call_to_action_caption && (
                  <a
                    href={announcement.call_to_action_link}
                    className="inline-block"
                  >
                    <button className="bg-[var(--main-colour-blue)] hover:bg-[var(--secondary-colour-green)] text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300 shadow-lg">
                      {announcement.call_to_action_caption}
                    </button>
                  </a>
                )}
            </div>

            {/* Image - Right side, centered */}
            <div className="col-span-1 flex flex-col sm:flex-row items-center justify-center p-8">
              <div className="relative w-full h-full flex items-center justify-center">
                {announcement.poster_url ? (
                  <Image
                    src={announcement.poster_url}
                    alt={announcement.poster_alt || `Slide ${index + 1}`}
                    fill={true}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-contain rounded-lg"
                    onError={(e: {
                      currentTarget: { style: { display: string } };
                    }) => {
                      console.error(
                        `Failed to load image: ${announcement.poster_url}`
                      );
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <p>
                    There was no announcement picture uploaded, this section
                    will be blank
                  </p>
                )}
              </div>
              {announcement.call_to_action_link &&
                announcement.call_to_action_caption && (
                  <a
                    href={announcement.call_to_action_link}
                    className="inline-block sm:hidden"
                  >
                    <button className="bg-[var(--main-colour-blue)] hover:bg-[var(--secondary-colour-green-light)] text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-300 shadow-lg">
                      {announcement.call_to_action_caption}
                    </button>
                  </a>
                )}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute left-5 right-5 top-1/2 flex -translate-y-1/2 transform justify-between">
        <button onClick={() => decrementCount()} className="btn btn-circle">
          ❮
        </button>
        <button onClick={() => incrementCount()} className="btn btn-circle">
          ❯
        </button>
      </div>
    </>
  );
}
