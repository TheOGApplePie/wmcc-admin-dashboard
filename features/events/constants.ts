/** Shared bounds for validation and event UI pagination. */
export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000;
export const MAX_SCHEDULE_OCCURRENCES = 5_000;
export const MAX_SCHEDULE_SPAN_DAYS = 3_660;
export const MAX_CALENDAR_RANGE_DAYS = 370;
export const DATABASE_PAGE_SIZE = 500;
export const EVENT_LIST_PAGE_SIZE = 30;
export const MAX_LIBRARY_PAGE_INDEX = 10_000;
export const MAX_EVENT_POSTER_BYTES = 5 * 1024 * 1024;
export const SCHEDULE_PREVIEW_LIMIT = 6;
export const CALENDAR_VISIBLE_EVENTS_PER_DAY = 3;
export const DEFAULT_RECURRENCE_COUNT = 10;
export const MAX_RECURRENCE_INTERVAL = 52;
export const ISO_DATE_LENGTH = 10;
export const EVENT_DESCRIPTION_PREVIEW_LENGTH = 50;
export const EVENT_FIELD_LIMITS = {
  titleMin: 3,
  titleMax: 50,
  descriptionMin: 20,
  descriptionMax: 1_500,
  shortTextMax: 100,
  ctaCaptionMax: 20,
} as const;
