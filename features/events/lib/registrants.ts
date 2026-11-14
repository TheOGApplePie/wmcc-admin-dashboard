export type Registration = Record<string, unknown>;

export function parseRegistrations(value: unknown): Registration[] {
  if (!Array.isArray(value) || value.some(
    (row) => row === null || typeof row !== "object" || Array.isArray(row),
  )) {
    throw new Error("Registration data must be an array of JSON objects.");
  }
  return value as Registration[];
}

/** Short generic list preview; labels and values remain authored by the submitting form. */
export function registrationPreview(row: Registration): string {
  return Object.entries(row)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .slice(0, 2)
    .map(([label, value]) => `${label}: ${String(value)}`)
    .join(" · ")
    .slice(0, 160);
}

export function registrationValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
