/**
 * Formats a date value into the `YYYY-MM-DDTHH:MM` string required by
 * `<input type="datetime-local">`, using the user's local timezone.
 */
export function formatDateTimeLocal(date: string | Date | null): string {
  if (!date) return "";

  const dateObj = typeof date === "string" ? new Date(date) : date;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
