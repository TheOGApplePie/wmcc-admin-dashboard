import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  SOCIAL_SLOT_TIMES,
  SOCIAL_TIME_ZONE,
  type OccupiedSlot,
  type SchedulePlatform,
  type SlotOption,
  type SocialChannel,
  type SocialTimeSlot,
} from "./types";

export function schedulePlatformFor(channel: SocialChannel): SchedulePlatform {
  if (channel.startsWith("instagram_")) return "instagram";
  if (channel === "whatsapp") return "whatsapp";
  return "tiktok";
}

export function scheduledAtFor(date: string, slot: SocialTimeSlot): string {
  return fromZonedTime(`${date}T${SOCIAL_SLOT_TIMES[slot]}`, SOCIAL_TIME_ZONE).toISOString();
}

export function availableSlots(
  channel: SocialChannel,
  date: string,
  occupied: OccupiedSlot[],
  eventOccurrenceAt?: string,
): SlotOption[] {
  const schedulePlatform = schedulePlatformFor(channel);
  const eventDate = eventOccurrenceAt
    ? formatInTimeZone(eventOccurrenceAt, SOCIAL_TIME_ZONE, "yyyy-MM-dd")
    : null;
  const eventInstant = eventOccurrenceAt ? Date.parse(eventOccurrenceAt) : null;

  return (Object.keys(SOCIAL_SLOT_TIMES) as SocialTimeSlot[])
    .filter((slot) => !occupied.some(
      (item) => item.schedulePlatform === schedulePlatform && item.date === date && item.slot === slot,
    ))
    .map((slot) => ({ schedulePlatform, date, slot, scheduledAt: scheduledAtFor(date, slot) }))
    .filter((option) => eventDate !== date || eventInstant === null || Date.parse(option.scheduledAt) < eventInstant);
}

