// Event recurrence and user-facing schedule times use Toronto local time.
// Delivery instants remain fixed in UTC; see scheduledAtFor().
export const SOCIAL_TIME_ZONE = "America/Toronto";

export const SOCIAL_SLOT_TIMES = {
  morning: "14:00:00",
  afternoon: "19:00:00",
  evening: "00:00:00",
} as const;

export type SocialTimeSlot = keyof typeof SOCIAL_SLOT_TIMES;
export type SocialChannel =
  | "instagram_feed"
  | "instagram_story"
  | "instagram_reel"
  | "whatsapp"
  | "tiktok_reel";
export type SchedulePlatform = "instagram" | "whatsapp" | "tiktok";
export type EventMilestone = "initial" | "two_weeks" | "one_week" | "two_days" | "one_day" | "event_day";

export interface ScheduleProposal {
  generationKey: string;
  kind: "initial" | "reminder" | "optional_reel";
  milestone: EventMilestone;
  milestoneDays: number;
  targetDate: string;
  eventOccurrenceAt: string;
  channels: SocialChannel[];
  compressed: boolean;
}

export interface EventScheduleInput {
  campaignId: string;
  campaignCreatedOn: string;
  eventOccurrenceAt: string;
  today: string;
  isFirstOccurrence?: boolean;
}

export interface OccupiedSlot {
  schedulePlatform: SchedulePlatform;
  date: string;
  slot: SocialTimeSlot;
}

export interface SlotOption extends OccupiedSlot {
  scheduledAt: string;
}
