import { calendarDayDifference, mondayWeekKey } from "./dates";

export interface StandaloneCadenceResult {
  valid: boolean;
  reason?: "outside_campaign" | "weekly_limit" | "three_day_buffer";
}

export function validateStandaloneOccurrence(
  candidateDate: string,
  existingOccurrenceDates: string[],
  campaignStartsOn?: string | null,
  campaignEndsOn?: string | null,
): StandaloneCadenceResult {
  if (
    (campaignStartsOn && candidateDate < campaignStartsOn) ||
    (campaignEndsOn && candidateDate > campaignEndsOn)
  ) {
    return { valid: false, reason: "outside_campaign" };
  }

  const uniqueDates = [...new Set(existingOccurrenceDates)];
  // Reusing an existing occurrence for another platform is distribution, not repetition.
  if (uniqueDates.includes(candidateDate)) return { valid: true };
  const sameWeek = uniqueDates.filter((date) => mondayWeekKey(date) === mondayWeekKey(candidateDate));
  if (sameWeek.length >= 2 && !sameWeek.includes(candidateDate)) {
    return { valid: false, reason: "weekly_limit" };
  }

  if (uniqueDates.some((date) => Math.abs(calendarDayDifference(candidateDate, date)) < 3)) {
    return { valid: false, reason: "three_day_buffer" };
  }

  return { valid: true };
}
