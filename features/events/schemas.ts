import {
  MAX_SCHEDULE_OCCURRENCES,
  MAX_CALENDAR_RANGE_DAYS,
  MILLISECONDS_PER_DAY,
  MAX_RECURRENCE_INTERVAL,
  EVENT_FIELD_LIMITS,
} from "./constants";
import { z } from "zod";
import { validateSchedule } from "./domain";
const https = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Use an HTTPS URL.");
const poster = https.refine(
  (value) =>
    new URL(value).origin ===
    new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    ).origin,
  "Use this project's Supabase Storage URL.",
);
export const baseFields = z
  .object({
    title: z
      .string()
      .trim()
      .min(EVENT_FIELD_LIMITS.titleMin)
      .max(EVENT_FIELD_LIMITS.titleMax),
    description: z
      .string()
      .trim()
      .min(EVENT_FIELD_LIMITS.descriptionMin)
      .max(EVENT_FIELD_LIMITS.descriptionMax),
    location: z.string().trim().min(1).max(EVENT_FIELD_LIMITS.shortTextMax),
    navigation_slug: z
      .string()
      .trim()
      .min(1)
      .max(EVENT_FIELD_LIMITS.shortTextMax)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Use lowercase letters, numbers and single dashes.",
      ),
    poster_url: poster.nullable(),
    poster_alt: z.string().trim().max(EVENT_FIELD_LIMITS.shortTextMax),
    call_to_action_link: https.nullable(),
    call_to_action_caption: z
      .string()
      .trim()
      .max(EVENT_FIELD_LIMITS.ctaCaptionMax)
      .nullable(),
    gallery_url: https.nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.poster_url && !data.poster_alt)
      ctx.addIssue({
        code: "custom",
        path: ["poster_alt"],
        message: "Describe the poster.",
      });
    if (
      Boolean(data.call_to_action_link) !== Boolean(data.call_to_action_caption)
    )
      ctx.addIssue({
        code: "custom",
        path: ["call_to_action_link"],
        message: "Provide the link and its caption together.",
      });
  });
export const ruleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(MAX_RECURRENCE_INTERVAL).nullable(),
  by_weekdays: z
    .array(z.enum(["su", "mo", "tu", "we", "th", "fr", "sa"]))
    .optional(),
  by_month_day: z.number().int().min(1).max(31).nullable(),
  by_set_position: z
    .array(
      z
        .number()
        .int()
        .refine((n) => [-2, -1, 1, 2, 3, 4].includes(n)),
    )
    .optional(),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  count: z.number().int().min(1).max(MAX_SCHEDULE_OCCURRENCES).nullable(),
  exdates: z.array(z.iso.date()).optional(),
});
function validateRuleShape(
  rule: z.infer<typeof ruleSchema> | null,
  ctx: z.RefinementCtx,
) {
  if (!rule) return;
  const days = rule.by_weekdays ?? [];
  const positions = rule.by_set_position ?? [];
  const issue = (message: string) =>
    ctx.addIssue({ code: "custom", path: ["recurrence_rule"], message });
  if (
    new Set(days).size !== days.length ||
    new Set(positions).size !== positions.length
  )
    issue("Recurrence selections must be unique.");
  const hasMonthly = Boolean(positions.length || rule.by_month_day);
  if (rule.frequency === "daily" && (days.length || hasMonthly))
    issue("Daily recurrence cannot include weekly or monthly filters.");
  if (rule.frequency === "weekly" && (!days.length || hasMonthly))
    issue("Weekly recurrence requires weekdays and no monthly filters.");
  if (rule.frequency !== "monthly") return;
  const hasDate = Boolean(rule.by_month_day);
  const hasWeekdayPattern = Boolean(days.length && positions.length);
  if (hasDate ? Boolean(days.length || positions.length) : !hasWeekdayPattern)
    issue("Choose a month day or weekdays with positions.");
}
export const scheduleFields = z
  .object({
    label: z.string().trim().max(EVENT_FIELD_LIMITS.shortTextMax),
    start_at: z.iso.datetime({ offset: true }),
    end_at: z.iso.datetime({ offset: true }),
    time_zone: z.literal("America/Toronto"),
    recurrence_rule: ruleSchema.nullable(),
    poster_url: poster.nullable(),
    poster_alt: z.string().trim().max(EVENT_FIELD_LIMITS.shortTextMax),
    location: z
      .string()
      .trim()
      .min(1)
      .max(EVENT_FIELD_LIMITS.shortTextMax)
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.poster_url && !data.poster_alt)
      ctx.addIssue({
        code: "custom",
        path: ["poster_alt"],
        message: "Describe the override poster.",
      });
    validateRuleShape(data.recurrence_rule, ctx);
    try {
      validateSchedule(data);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["recurrence_rule"],
        message: error instanceof Error ? error.message : "Invalid schedule.",
      });
    }
  });
export const saveEventSchema = z.object({
  id: z.number().int().positive().optional(),
  version: z.number().int().optional(),
  request_id: z.uuid(),
  fields: baseFields,
});
export const saveScheduleSchema = z.object({
  event_id: z.number().int().positive(),
  id: z.uuid().optional(),
  version: z.number().int().optional(),
  request_id: z.uuid(),
  fields: scheduleFields,
  split_from: z.iso.date().optional(),
});
export const versionedEventSchema = z.object({
  event_id: z.number().int().positive(),
  version: z.number().int().positive(),
  request_id: z.uuid(),
});
export const eventRangeSchema = z
  .object({ rangeStart: z.date(), rangeEnd: z.date() })
  .refine(
    (data) =>
      data.rangeEnd > data.rangeStart &&
      data.rangeEnd.getTime() - data.rangeStart.getTime() <=
        MAX_CALENDAR_RANGE_DAYS * MILLISECONDS_PER_DAY,
    "Choose a range of at most one year.",
  );
export const scheduleExceptionSchema = versionedEventSchema
  .extend({
    id: z.uuid(),
    original_date: z.iso.date(),
    action: z.enum(["edit", "cancel", "restore"]),
    start_at: z.iso.datetime({ offset: true }).optional(),
    end_at: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.action === "edit" &&
      (!input.start_at ||
        !input.end_at ||
        Date.parse(input.end_at) <= Date.parse(input.start_at))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["end_at"],
        message: "Provide a start and a later end time.",
      });
    }
  });
