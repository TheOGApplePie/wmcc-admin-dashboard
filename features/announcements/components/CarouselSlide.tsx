"use client";

import AnnouncementImage from "@/features/announcements/components/AnnouncementImage";
import type { Announcement } from "@/app/schemas/announcement";

export default function CarouselSlide({
  announcement,
  isMobile,
}: Readonly<{ announcement: Announcement; isMobile: boolean }>) {
  const hasPoster = !!announcement.poster_url;
  const ctaLabel = announcement.call_to_action_caption || "Learn More";

  const CtaButton = announcement.call_to_action_link ? (
    <span
      className="px-6 py-2.5 rounded-lg text-white font-semibold text-[13px] cursor-default"
      style={{ backgroundColor: "#0F8073" }}
    >
      {ctaLabel}
    </span>
  ) : null;

  if (isMobile) {
    return hasPoster ? (
      <div className="flex flex-col items-center gap-4 p-5 h-full justify-center">
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{ maxWidth: 160, aspectRatio: "3/4" }}
        >
          <AnnouncementImage
            src={announcement.poster_url!}
            alt={announcement.poster_alt || announcement.title}
            fill
            className="object-cover"
          />
        </div>
        {CtaButton}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center gap-3 p-6 h-full text-center">
        <h2 className="font-bold text-white text-[17px] leading-snug">
          {announcement.title}
        </h2>
        <p className="text-white/70 text-[12px] leading-relaxed">
          {announcement.description}
        </p>
        {CtaButton}
      </div>
    );
  }

  if (hasPoster) {
    return (
      <div className="grid grid-cols-2 gap-6 items-center px-10 py-8 h-full">
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-white text-[22px] leading-snug">
            {announcement.title}
          </h2>
          <p className="text-white/70 text-[14px] leading-relaxed">
            {announcement.description}
          </p>
          {CtaButton}
        </div>
        <div className="flex items-center justify-center">
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-lg"
            style={{ maxWidth: 240, aspectRatio: "3/4" }}
          >
            <AnnouncementImage
              src={announcement.poster_url!}
              alt={announcement.poster_alt || announcement.title}
              fill
              className="object-cover"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-16 py-10 h-full text-center">
      <h2 className="font-bold text-white text-[24px] leading-snug">
        {announcement.title}
      </h2>
      <p className="text-white/70 text-[14px] leading-relaxed max-w-md">
        {announcement.description}
      </p>
      {CtaButton}
    </div>
  );
}
