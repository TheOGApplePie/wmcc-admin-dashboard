import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { PlatformType, PostType, TimeSlot } from "@/app/schemas/postScheduling";

const TZ = "America/Toronto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PostDraft = {
  post_type: PostType;
  is_recurring_reminder: boolean;
  occurrence_date: string | null;
  platforms: PlatformType[];
  cross_post_facebook: boolean;
  scheduled_date: string; // 'YYYY-MM-DD'
  time_slot: TimeSlot;
  scheduled_at: string; // ISO UTC
  banner_image_url: string | null;
  caption: string | null;
  hashtags: string[];
  whatsapp_text: string | null;
  requires_manual: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SLOT_HOUR: Record<TimeSlot, number> = {
  morning: 9,
  afternoon: 14,
  evening: 19,
};

const DEFAULT_PLATFORMS: Record<PostType, PlatformType[]> = {
  ANNOUNCEMENT: ["instagram_feed", "whatsapp"],
  REMINDER: ["instagram_feed", "whatsapp"],
  GENERAL: ["instagram_feed"],
};

// ─── Date utilities ───────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function diffDays(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + "T12:00:00Z");
  const to = new Date(toStr + "T12:00:00Z");
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

// Converts a date string (YYYY-MM-DD) + time slot into an absolute UTC timestamp,
// correctly accounting for DST in the America/Toronto timezone.
export function resolveScheduledAt(dateStr: string, slot: TimeSlot): string {
  const hour = SLOT_HOUR[slot];
  const localDatetime = `${dateStr}T${String(hour).padStart(2, "0")}:00:00`;
  return fromZonedTime(localDatetime, TZ).toISOString();
}

// Returns today's date string in ET.
export function getTodayET(): string {
  const now = toZonedTime(new Date(), TZ);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Draft builder ────────────────────────────────────────────────────────────

function makeDraft(
  type: PostType,
  dateStr: string,
  slot: TimeSlot,
  overrides: Partial<PostDraft> = {},
): PostDraft {
  return {
    post_type: type,
    is_recurring_reminder: false,
    occurrence_date: null,
    platforms: DEFAULT_PLATFORMS[type],
    cross_post_facebook: false,
    scheduled_date: dateStr,
    time_slot: slot,
    scheduled_at: resolveScheduledAt(dateStr, slot),
    banner_image_url: null,
    caption: null,
    hashtags: [],
    whatsapp_text: null,
    requires_manual: false,
    ...overrides,
  };
}

// ─── Main schedule generator ──────────────────────────────────────────────────

/**
 * Generates the default post schedule for a one-time event (or the initial
 * campaign for the first occurrence of a recurring event).
 *
 * Returns an array of PostDraft objects. No DB calls — caller inserts them.
 */
export function generateDefaultSchedule(
  eventDateStr: string,
  todayStr: string,
): PostDraft[] {
  const daysUntil = diffDays(todayStr, eventDateStr);
  const posts: PostDraft[] = [];

  // ── Announcement date ───────────────────────────────────────────────────────
  let announcementDateStr: string | null = null;

  if (daysUntil >= 28) {
    announcementDateStr = addDays(eventDateStr, -28);
  } else if (daysUntil >= 3) {
    announcementDateStr = todayStr; // compressed: announce as soon as possible
  }
  // < 3 days: skip announcement entirely

  if (announcementDateStr) {
    posts.push(makeDraft("ANNOUNCEMENT", announcementDateStr, "morning"));

    // ── General posts ─────────────────────────────────────────────────────────
    const generalCutoff = addDays(eventDateStr, -2); // stop 48h before event
    let generalDate = addDays(announcementDateStr, 7);

    while (generalDate < generalCutoff) {
      posts.push(makeDraft("GENERAL", generalDate, "afternoon"));
      generalDate = addDays(generalDate, 5);
    }
  }

  // ── Reminder ────────────────────────────────────────────────────────────────
  const reminderDate = addDays(eventDateStr, -2);
  if (reminderDate >= todayStr) {
    posts.push(makeDraft("REMINDER", reminderDate, "evening"));
  } else if (daysUntil >= 1) {
    // Event is within 48h but hasn't started yet: last-minute reminder today
    posts.push(makeDraft("REMINDER", todayStr, "morning"));
  }
  // daysUntil < 1: event is today or past — no reminder generated

  return posts;
}

// ─── Recurring occurrence reminders ──────────────────────────────────────────

/**
 * For recurring events, generates one reminder post per future occurrence
 * within the rolling window. Skips an occurrence if its reminder would fall
 * within 24h of the previous one (merge rule).
 */
export function generateRecurringReminders(
  occurrences: string[], // sorted 'YYYY-MM-DD' strings from rrule expansion
  todayStr: string,
  windowDays = 60,
): PostDraft[] {
  const cutoff = addDays(todayStr, windowDays);
  const relevant = occurrences.filter((o) => o > todayStr && o <= cutoff);

  const drafts: PostDraft[] = [];
  let previousReminderDate: string | null = null;

  for (const occ of relevant) {
    const reminderDate = addDays(occ, -2);

    // Merge rule: skip if this reminder falls within 24h of the previous
    if (previousReminderDate && diffDays(previousReminderDate, reminderDate) < 1) {
      continue;
    }

    drafts.push(
      makeDraft("REMINDER", reminderDate, "evening", {
        is_recurring_reminder: true,
        occurrence_date: occ,
        platforms: ["instagram_feed", "whatsapp"],
      }),
    );
    previousReminderDate = reminderDate;
  }

  return drafts;
}
