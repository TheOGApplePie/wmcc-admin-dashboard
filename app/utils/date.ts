import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const EVENT_TIME_ZONE = "America/Toronto";

/** Formats a UTC database instant for a Toronto `datetime-local` input. */
export function formatDateTimeLocal(date: string | Date | null): string {
  if (!date) return "";
  return formatInTimeZone(date, EVENT_TIME_ZONE, "yyyy-MM-dd'T'HH:mm");
}

/** Interprets a timezone-less form value as Toronto time and returns a UTC instant. */
export function torontoInputToUtc(value: string | Date): Date {
  if (value instanceof Date) return value;
  const utcDate = fromZonedTime(value, EVENT_TIME_ZONE);
  const roundTrip = formatInTimeZone(
    utcDate,
    EVENT_TIME_ZONE,
    "yyyy-MM-dd'T'HH:mm",
  );
  if (roundTrip !== value.slice(0, 16)) {
    throw new RangeError(
      "That local time does not exist in Toronto because of the daylight-saving transition. Choose another time.",
    );
  }
  return utcDate;
}

/** Returns the Toronto calendar date for a UTC instant. */
export function torontoDate(value: string | Date): string {
  return formatInTimeZone(value, EVENT_TIME_ZONE, "yyyy-MM-dd");
}
