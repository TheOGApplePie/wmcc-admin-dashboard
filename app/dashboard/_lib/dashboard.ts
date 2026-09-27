import type { Event } from "@/app/schemas/events";

export const ALSO_THIS_WEEK_DOT_CLASSES = ["bg-violet", "bg-teal", "bg-amber", "bg-coral"] as const;
export const DASHBOARD_EVENT_LIMIT = 4;

export const POST_BADGE: Record<
  string,
  { label: string; variant: "teal" | "amber" | "coral" | "muted" }
> = {
  draft: { label: "Draft", variant: "muted" },
  scheduled: { label: "Scheduled", variant: "teal" },
  published: { label: "Published", variant: "teal" },
  failed: { label: "Failed", variant: "coral" },
};

export function fmtTime(startDate: Date | string): string {
  return new Date(startDate).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Toronto",
  });
}

export function recurrenceLabel(rule: Event["recurrence_rule"]): string {
  const DAY_NAMES: Record<string, string> = {
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
    SU: "Sunday",
  };
  if (!rule) return "Recurring";
  if (rule.frequency === "daily") return "Daily";
  if (rule.frequency === "weekly" && rule.by_weekdays?.length) {
    const days = rule.by_weekdays.map(
      (d) => DAY_NAMES[String(d).slice(-2).toUpperCase()] ?? String(d),
    );
    return `Every ${days.join(" & ")}`;
  }
  if (rule.frequency === "monthly") return "Monthly";
  return "Recurring";
}

export function occurrenceTimeLabel(
  event: Event,
  occurrenceDate: Date,
): string {
  if (event.is_recurring && event.recurrence_rule) {
    return recurrenceLabel(event.recurrence_rule);
  }
  return occurrenceDate.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const DASHBOARD_LOOKAHEAD_DAYS = 14;
export const DASHBOARD_POST_LIMIT = 5;
export const DASHBOARD_FEEDBACK_LIMIT = 4;
