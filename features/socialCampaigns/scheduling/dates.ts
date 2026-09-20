const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDateOnly(value: string): void {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new RangeError(`Expected a YYYY-MM-DD date, received "${value}".`);
  }
}

export function addCalendarDays(date: string, amount: number): string {
  assertDateOnly(date);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function calendarDayDifference(later: string, earlier: string): number {
  assertDateOnly(later);
  assertDateOnly(earlier);
  return Math.round(
    (Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000,
  );
}

export function mondayWeekKey(date: string): string {
  assertDateOnly(date);
  const value = new Date(`${date}T12:00:00Z`);
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  return addCalendarDays(date, -daysSinceMonday);
}

