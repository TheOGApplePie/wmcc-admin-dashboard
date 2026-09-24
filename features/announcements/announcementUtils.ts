import type { Announcement } from "@/app/schemas/announcement";

export function isScheduled(a: Pick<Announcement, "publish_at">, now = new Date()) {
  return !!a.publish_at && new Date(a.publish_at) > now;
}

export function isExpired(a: Announcement) {
  return new Date(a.expires_at) < new Date();
}

export function formatAnnouncementDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/Toronto",
  });
}
