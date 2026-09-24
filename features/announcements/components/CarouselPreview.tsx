"use client";

import type { Announcement } from "@/app/schemas/announcement";
import CarouselSlide from "./CarouselSlide";
import BrowserBar from "./BrowserBar";

interface CarouselPreviewProps {
  announcements: Announcement[];
  selected: Announcement | null;
  isMobile: boolean;
  onNavigate: (ann: Announcement) => void;
}

export default function CarouselPreview({
  announcements,
  selected,
  isMobile,
  onNavigate,
}: Readonly<CarouselPreviewProps>) {
  const slideIndex = selected
    ? Math.max(
        0,
        announcements.findIndex((a) => a.id === selected.id),
      )
    : 0;

  function prev() {
    if (!announcements.length) return;
    onNavigate(
      announcements[
        (slideIndex - 1 + announcements.length) % announcements.length
      ],
    );
  }

  function next() {
    if (!announcements.length) return;
    onNavigate(announcements[(slideIndex + 1) % announcements.length]);
  }

  const dots = announcements.length > 1 && (
    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 pointer-events-none">
      {announcements.map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width: i === slideIndex ? 20 : 6,
            height: 6,
            backgroundColor:
              i === slideIndex ? "#fff" : "rgba(255,255,255,.35)",
          }}
        />
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex items-center justify-center py-5">
        <div
          className="overflow-hidden"
          style={{
            width: 195,
            height: 370,
            borderRadius: 28,
            border: "5px solid #15201C",
          }}
        >
          <div
            className="flex justify-center pt-2 pb-1"
            style={{ backgroundColor: "#15201C" }}
          >
            <div
              className="w-14 h-3 rounded-full"
              style={{ backgroundColor: "#0a130f" }}
            />
          </div>
          <div
            className="announcement-slide-bg relative"
            style={{ height: "calc(100% - 22px)" }}
          >
            {selected ? (
              <CarouselSlide announcement={selected} isMobile />
            ) : (
              <div className="flex items-center justify-center h-full opacity-30 text-white text-[11px]">
                No announcements
              </div>
            )}
            {dots}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="rounded-xl border border-line overflow-hidden shadow-md">
        <BrowserBar />
        <div
          className="announcement-slide-bg relative"
          style={{ minHeight: 240 }}
        >
          {selected ? (
            <CarouselSlide announcement={selected} isMobile={false} />
          ) : (
            <div className="flex items-center justify-center py-14 opacity-30 text-white text-[13px]">
              No announcements
            </div>
          )}
          {announcements.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: "rgba(255,255,255,.15)",
                  backdropFilter: "blur(4px)",
                }}
                aria-label="Previous announcement"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={next}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: "rgba(255,255,255,.15)",
                  backdropFilter: "blur(4px)",
                }}
                aria-label="Next announcement"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}
          {dots}
        </div>
      </div>
    </div>
  );
}
