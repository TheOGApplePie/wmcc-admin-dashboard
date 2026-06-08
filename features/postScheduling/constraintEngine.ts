import { ScheduledPost, TimeSlot, WeekConstraintResult } from "@/app/schemas/postScheduling";

// ─── Post state helpers ───────────────────────────────────────────────────────

export function isRevertable(post: ScheduledPost): boolean {
  if (post.status === "failed") return true;
  if (post.status !== "scheduled") return false;
  const futurePost = new Date(post.scheduled_at) > new Date();
  const stuckPost = new Date(post.updated_at).getTime() < Date.now() - 2 * 60 * 60 * 1000;
  return futurePost || stuckPost;
}

const FEED_LIMIT_PER_WEEK = 2;
const STORY_LIMIT_PER_WEEK = 5;

// ─── Date utilities ───────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

// Returns an ISO week key 'YYYY-WW' (week starts Monday) for a date string.
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dayOfWeek);
  const year = monday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(
    ((monday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

// ─── Platform classification ──────────────────────────────────────────────────

const FEED_PLATFORMS = new Set(["instagram_feed"]);
const STORY_PLATFORMS = new Set(["instagram_story"]);

function isFeedPost(post: Pick<ScheduledPost, "post_type" | "platforms">): boolean {
  if (post.post_type === "REMINDER") return false; // exempt from limits
  return post.platforms.some((p) => FEED_PLATFORMS.has(p));
}

function isStoryPost(post: Pick<ScheduledPost, "post_type" | "platforms">): boolean {
  return post.platforms.some((p) => STORY_PLATFORMS.has(p));
}

// ─── Weekly constraint checker ────────────────────────────────────────────────

/**
 * Returns how many feed/story posts are scheduled for the ISO week containing
 * candidateDate, and whether adding another would violate the limits.
 */
export function checkWeeklyConstraints(
  existingPosts: ScheduledPost[],
  candidateDate: string,
): WeekConstraintResult {
  const week = isoWeekKey(candidateDate);
  const activeStatuses = new Set(["draft", "scheduled"]);

  const weekPosts = existingPosts.filter(
    (p) => isoWeekKey(p.scheduled_date) === week && activeStatuses.has(p.status),
  );

  const feedCount = weekPosts.filter(isFeedPost).length;
  const storyCount = weekPosts.filter(isStoryPost).length;
  const violations: string[] = [];

  if (feedCount >= FEED_LIMIT_PER_WEEK) {
    violations.push(
      `Week ${week} already has ${feedCount}/${FEED_LIMIT_PER_WEEK} feed posts.`,
    );
  }
  if (storyCount >= STORY_LIMIT_PER_WEEK) {
    violations.push(
      `Week ${week} already has ${storyCount}/${STORY_LIMIT_PER_WEEK} story posts.`,
    );
  }

  return {
    feedPostsThisWeek: feedCount,
    storyPostsThisWeek: storyCount,
    feedCapacityRemaining: Math.max(0, FEED_LIMIT_PER_WEEK - feedCount),
    storyCapacityRemaining: Math.max(0, STORY_LIMIT_PER_WEEK - storyCount),
    violations,
  };
}

// ─── Day constraint states (for calendar colour-coding) ──────────────────────

export type DayState = "available" | "limited" | "blocked";

export interface DayConstraintMap {
  [dateStr: string]: DayState;
}

/**
 * For a given date range, returns a map of dateStr -> DayState based on how
 * many feed posts are already scheduled that week:
 *   available — feed capacity remaining >= 2
 *   limited   — feed capacity remaining == 1
 *   blocked   — feed capacity remaining == 0
 */
export function getDayConstraintStates(
  existingPosts: ScheduledPost[],
  startDate: string,
  endDate: string,
): DayConstraintMap {
  const result: DayConstraintMap = {};
  let cursor = startDate;

  while (cursor <= endDate) {
    const { feedCapacityRemaining } = checkWeeklyConstraints(existingPosts, cursor);
    if (feedCapacityRemaining === 0) {
      result[cursor] = "blocked";
    } else if (feedCapacityRemaining === 1) {
      result[cursor] = "limited";
    } else {
      result[cursor] = "available";
    }
    cursor = addDays(cursor, 1);
  }

  return result;
}

// ─── Available slots for a date (for PostModal slot picker) ──────────────────

/**
 * Returns time slots that are not yet occupied on a given date.
 * A slot is occupied if any non-failed post (from any event) is already
 * scheduled there, excluding the post being edited (if any).
 */
export function getAvailableSlotsForDate(
  existingPosts: ScheduledPost[],
  date: string,
  excludePostId?: number,
): TimeSlot[] {
  return SLOTS.filter((slot) =>
    !existingPosts.some(
      (p) =>
        p.scheduled_date === date &&
        p.time_slot === slot &&
        p.status !== "failed" &&
        p.id !== excludePostId,
    ),
  );
}

// ─── Slot collision resolver ──────────────────────────────────────────────────

const SLOTS: TimeSlot[] = ["morning", "afternoon", "evening"];

/**
 * Finds the next available slot for an event, starting from candidateDate +
 * candidateSlot. Searches forward up to maxDaysForward days.
 *
 * A slot is "occupied" if any non-failed post for the same event already
 * lives there. REMINDER posts are exempt from the weekly feed/story limits
 * but still avoid same-event slot collisions.
 */
export function resolveSlotCollision(
  existingPosts: ScheduledPost[],
  candidateDate: string,
  candidateSlot: TimeSlot,
  eventId: number,
  maxDaysForward = 3,
): { date: string; slot: TimeSlot } | null {
  for (let dayOffset = 0; dayOffset <= maxDaysForward; dayOffset++) {
    const tryDate = addDays(candidateDate, dayOffset);
    const slotsToTry =
      dayOffset === 0
        ? SLOTS.slice(SLOTS.indexOf(candidateSlot)) // same day: start from collision slot
        : SLOTS; // next days: try all slots

    for (const slot of slotsToTry) {
      const occupied = existingPosts.some(
        (p) =>
          p.scheduled_date === tryDate &&
          p.time_slot === slot &&
          p.event_id === eventId &&
          p.status !== "failed",
      );
      if (!occupied) return { date: tryDate, slot };
    }
  }
  return null; // no free slot found within window
}
