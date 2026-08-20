import { z } from "zod";
import { FIVE_MB } from "../constants/general";
import { torontoDate } from "../utils/date";
export type EventFrequency = "daily" | "weekly" | "monthly";
export type EventWeekday = "su" | "mo" | "tu" | "we" | "th" | "fr" | "sa";
export type EditEventAction = "all" | "single" | "future" | "yes";
export type DeleteEventAction = "all" | "this" | "future" | "yes";

const POSTER_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
).origin;
const httpsUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "URL must use HTTPS.",
  );
const galleryUrl = httpsUrl.refine(
  (value) => new URL(value).hostname === "institutei3-my.sharepoint.com",
  "Gallery URL must be hosted at institutei3-my.sharepoint.com.",
);
const posterUrl = httpsUrl.refine(
  (value) => {
    const url = new URL(value);
    return url.origin === POSTER_ORIGIN;
  },
  "Poster URL must be hosted by this site's Supabase project.",
);
const navigationSlug = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[a-zA-Z]+(?:-[a-zA-Z]+)*$/,
    "Navigation slug must use English-letter segments separated by single dashes.",
  );

export interface Event {
  id: number;
  title: string;
  description: string;
  location: string;
  poster_url: string | null;
  poster_file: File | null;
  poster_alt: string;
  call_to_action_link: string | null;
  call_to_action_caption: string;
  start_date: Date | string;
  end_date: Date | string;
  action: EditEventAction | DeleteEventAction;
  gallery_url: string | null;
  navigation_slug: string;
  is_recurring: boolean;
  recurrence_rule_id?: number;
  recurrence_rule?: {
    frequency: EventFrequency;
    interval: number | null;
    by_weekdays: EventWeekday[];
    by_month_day: number | null; // e.g. 2 for "2nd of each month"
    by_set_position?: number[]; // e.g. 1 for "1st", -1 for "last"
    until: Date | string | null; // Date limit
    count: number | null; // Occurrences limit
    exdates?: string[]; // ISO date strings of excluded occurrences
  };
}
export interface FCRRuleInput {
  freq: string;
  dtstart: string;
  interval?: number;
  byweekday?: string[];
  bymonthday?: number;
  bysetpos?: number[];
  until?: string;
  count?: number;
}
export interface RecurrenceRule {
  frequency: string;
  interval?: number | null;
  by_weekdays?: string[] | null;
  by_month_day?: number | null;
  by_set_position?: number[] | null;
  until?: string | null;
  count?: number | null;
  exdates?: string[] | null;
}
// Strips a Date to its UTC calendar day string (YYYY-MM-DD) for date-only comparisons.
const toUTCDateStr = (d: Date | string) =>
  new Date(d).toISOString().split("T")[0];

const recurrenceRuleShape = {
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.coerce.number().int().min(1).max(20).nullable(),
  by_weekdays: z
    .array(z.enum(["su", "mo", "tu", "we", "th", "fr", "sa"]))
    .optional(),
  by_month_day: z.coerce.number().int().min(1).max(31).nullable(),
  by_set_position: z
    .array(
      z.coerce
        .number()
        .int()
        .refine((value) => [-2, -1, 1, 2].includes(value)),
    )
    .optional(),
  until: z.coerce.date().nullable(),
  count: z.coerce.number().int().min(1).max(20).nullable(),
  exdates: z.array(z.string()).optional(),
};
const createRecurrenceRuleShape = {
  ...recurrenceRuleShape,
  count: z.coerce.number().int().min(2).max(20).nullable(),
};

// ─── Shared validation helpers ────────────────────────────────────────────────

function validatePoster(
  data: {
    poster_file?: File | null;
    poster_url: string | null;
    poster_alt: string;
  },
  ctx: z.RefinementCtx,
) {
  if (data.poster_file && data.poster_url) {
    ctx.addIssue({
      code: "custom",
      message: "Choose either an uploaded poster or a poster URL, not both.",
      path: ["poster_file"],
    });
  }
  if (data.poster_file) {
    const image = data.poster_file;
    if (image.size > FIVE_MB) {
      ctx.addIssue({
        code: "custom",
        message:
          "The file you are uploading is too large. Please upload an image less than 5MB.",
        path: ["poster_file"],
      });
    } else if (!["image/jpeg", "image/jpg", "image/png"].includes(image.type)) {
      ctx.addIssue({
        code: "custom",
        message:
          "The file you are uploading is of an unsupported type. Please only upload JPEG/JPG or PNG images",
        path: ["poster_file"],
      });
    } else if (!data.poster_alt) {
      ctx.addIssue({
        code: "custom",
        message: "The poster alt is required when specifying a picture.",
        path: ["poster_alt"],
      });
    }
  } else if (data.poster_url && !data.poster_alt) {
    ctx.addIssue({
      code: "custom",
      message: "The poster alt is required when specifying a picture.",
      path: ["poster_alt"],
    });
  } else if (!data.poster_file && !data.poster_url && data.poster_alt) {
    ctx.addIssue({
      code: "custom",
      message: "Please specify an image or remove the caption.",
      path: ["poster_url", "poster_file"],
    });
  }
}

function validateCTA(
  data: {
    call_to_action_link: string | null;
    call_to_action_caption: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (!data.call_to_action_link && data.call_to_action_caption) {
    ctx.addIssue({
      code: "custom",
      message: "Please specify a call to action link or remove the caption.",
      path: ["call_to_action_link"],
    });
  } else if (data.call_to_action_link && !data.call_to_action_caption) {
    ctx.addIssue({
      code: "custom",
      message: "Please specify a call to action caption or remove the link.",
      path: ["call_to_action_caption"],
    });
  }
}

function validateFrequencyRule(
  rule: {
    frequency: string;
    interval: number | null;
    by_weekdays?: string[];
    by_month_day: number | null;
    by_set_position?: number[];
  },
  ctx: z.RefinementCtx,
) {
  if (rule.frequency === "daily") {
    if (!rule.interval || rule.interval < 1 || rule.interval > 20) {
      ctx.addIssue({
        code: "custom",
        message:
          "Please make sure the interval of the recurrence is between 1 and 20",
        path: ["recurrence_rule.interval"],
      });
    }
    if (
      rule.by_weekdays?.length ||
      rule.by_month_day ||
      rule.by_set_position?.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Daily recurrence cannot include weekly or monthly filters.",
        path: ["recurrence_rule"],
      });
    }
  } else if (rule.frequency === "weekly") {
    if (rule.interval !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Weekly recurrence must use an interval of 1.",
        path: ["recurrence_rule.interval"],
      });
    }
    if (!rule.by_weekdays?.length) {
      ctx.addIssue({
        code: "custom",
        message:
          "Please provide the days of the week you want this event to repeat on.",
        path: ["recurrence_rule.by_weekdays"],
      });
    }
    if (rule.by_month_day || rule.by_set_position?.length) {
      ctx.addIssue({
        code: "custom",
        message: "Weekly recurrence cannot include monthly filters.",
        path: ["recurrence_rule"],
      });
    }
  } else if (rule.frequency === "monthly") {
    if (rule.interval !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Monthly recurrence must use an interval of 1.",
        path: ["recurrence_rule.interval"],
      });
    }
    const byDate = Boolean(rule.by_month_day);
    const hasWeekdays = Boolean(rule.by_weekdays?.length);
    const hasPositions = Boolean(rule.by_set_position?.length);
    if (
      (!byDate && (!hasWeekdays || !hasPositions)) ||
      (byDate && (hasWeekdays || hasPositions))
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Monthly recurrence requires either one month date or both weekday and position settings.",
        path: ["recurrence_rule.frequency"],
      });
    }
  }
}

function validateRecurrenceRule(
  data: {
    is_recurring: boolean;
    recurrence_rule?: {
      frequency: string;
      interval: number | null;
      by_weekdays?: string[];
      by_month_day: number | null;
      by_set_position?: number[];
      until: Date | string | null;
      count: number | null;
    };
    start_date: Date;
    end_date: Date;
  },
  ctx: z.RefinementCtx,
) {
  if (!data.is_recurring) return;

  if (!data.recurrence_rule) {
    ctx.addIssue({
      code: "custom",
      message: "Please configure the recurrence settings for this event.",
      path: ["recurrence_rule"],
    });
    return;
  }

  const rule = data.recurrence_rule;

  if (
    rule.by_weekdays &&
    new Set(rule.by_weekdays).size !== rule.by_weekdays.length
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Recurrence weekdays must be unique.",
      path: ["recurrence_rule.by_weekdays"],
    });
  }
  if (
    rule.by_set_position &&
    new Set(rule.by_set_position).size !== rule.by_set_position.length
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Monthly positions must be unique.",
      path: ["recurrence_rule.by_set_position"],
    });
  }

  if (
    !rule.frequency ||
    !["daily", "weekly", "monthly"].includes(rule.frequency)
  ) {
    ctx.addIssue({
      code: "custom",
      message:
        "Please specify a recurrence period that is either daily, weekly, or monthly",
      path: ["recurrence_rule.frequency"],
    });
  }

  validateFrequencyRule(rule, ctx);

  if (!rule.until && !rule.count) {
    ctx.addIssue({
      code: "custom",
      message:
        "Please provide either a number of occurences or a termination date. At this time, unlimited recurrences are not supported.",
      path: ["recurrence_rule"],
    });
  }
  if (rule.until && rule.count) {
    ctx.addIssue({
      code: "custom",
      message: "Choose either a termination date or an occurrence count, not both.",
      path: ["recurrence_rule"],
    });
  }

  if (rule.until) {
    const untilDay = toUTCDateStr(rule.until);
    const startDateDay = torontoDate(data.start_date);
    if (untilDay < startDateDay) {
      ctx.addIssue({
        code: "custom",
        message:
          "The recurrence end date must be on or after the event's Toronto start date.",
        path: ["recurrence_rule.until"],
      });
    }
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateEventZod = z
  .object({
    title: z.string().trim().min(3).max(50),
    description: z.string().trim().min(20).max(1500),
    location: z.string().trim().min(1).max(100),
    poster_url: z.nullable(posterUrl),
    poster_file: z.file().nullable(),
    poster_alt: z.string().trim().max(100),
    call_to_action_link: z.nullable(httpsUrl),
    call_to_action_caption: z.nullable(z.string().trim().max(20)),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    gallery_url: z.preprocess(
      (v) => (v === "" ? null : v),
      z.nullable(galleryUrl),
    ),
    navigation_slug: navigationSlug,
    is_recurring: z.boolean(),
    created_at: z.optional(z.coerce.date()),
    recurrence_rule: z.object(createRecurrenceRuleShape).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.end_date <= data.start_date) {
      ctx.addIssue({
        code: "custom",
        message: "The end date of the event must be after the start date.",
        path: ["end_date"],
      });
    }
    validatePoster(data, ctx);
    validateCTA(data, ctx);
    if (data.is_recurring !== Boolean(data.recurrence_rule)) {
      ctx.addIssue({
        code: "custom",
        message:
          "Recurrence settings must match the recurring-event selection.",
        path: ["recurrence_rule"],
      });
    }
    validateRecurrenceRule(data, ctx);
  });

export const EditEventZod = z
  .object({
    id: z.coerce.number().int().positive(),
    title: z.string().trim().min(3).max(50),
    description: z.string().trim().min(20).max(1500),
    location: z.string().trim().min(1).max(100),
    poster_url: z.nullable(posterUrl),
    poster_file: z.file().nullable(),
    poster_alt: z.string().trim().max(100),
    call_to_action_link: z.nullable(httpsUrl),
    call_to_action_caption: z.nullable(z.string().trim().max(20)),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    action: z.enum(["all", "single", "future", "yes"]),
    occurrence_date: z.coerce.date().optional(),
    is_recurring: z.boolean(),
    recurrence_rule_id: z.coerce.number().int().positive().optional(),
    gallery_url: z.preprocess(
      (v) => (v === "" ? null : v),
      z.nullable(galleryUrl),
    ),
    navigation_slug: navigationSlug,
    recurrence_rule: z.object(recurrenceRuleShape).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.end_date <= data.start_date) {
      ctx.addIssue({
        code: "custom",
        message: "The end date of the event must be after the start date.",
        path: ["end_date"],
      });
    }
    validatePoster(data, ctx);
    validateCTA(data, ctx);
    const hasRuleId = Boolean(data.recurrence_rule_id);
    const hasOccurrence = Boolean(data.occurrence_date);
    const existingSeriesAction =
      data.action === "all" ||
      data.action === "future" ||
      (data.action === "single" && hasRuleId);

    if (existingSeriesAction && (!data.is_recurring || !hasRuleId)) {
      ctx.addIssue({
        code: "custom",
        message: "This operation requires an existing recurring event.",
        path: ["recurrence_rule_id"],
      });
    }
    if (
      (data.action === "future" ||
        (data.action === "single" && hasRuleId)) &&
      !hasOccurrence
    ) {
      ctx.addIssue({
        code: "custom",
        message: "An occurrence is required for this operation.",
        path: ["occurrence_date"],
      });
    }
    if (data.action === "all" && hasOccurrence) {
      ctx.addIssue({
        code: "custom",
        message:
          "Editing all occurrences does not accept a single occurrence date.",
        path: ["occurrence_date"],
      });
    }
    if (
      data.action === "yes" &&
      (data.is_recurring ||
        !hasRuleId ||
        data.recurrence_rule ||
        hasOccurrence)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Removing recurrence requires the existing rule and no new recurrence settings.",
        path: ["action"],
      });
    }
    if (
      data.action === "single" &&
      !hasRuleId &&
      hasOccurrence
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "A non-recurring edit or recurrence conversion cannot include an occurrence date.",
        path: ["occurrence_date"],
      });
    }
    if (
      data.action === "single" &&
      !hasRuleId &&
      !data.is_recurring &&
      data.recurrence_rule
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A non-recurring edit cannot include recurrence settings.",
        path: ["recurrence_rule"],
      });
    }
    if (
      data.action === "single" &&
      !hasRuleId &&
      data.is_recurring &&
      data.recurrence_rule?.count === 1
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A new recurring series requires at least two occurrences.",
        path: ["recurrence_rule.count"],
      });
    }
    if (data.is_recurring) {
      validateRecurrenceRule(data, ctx);
    }
  });

export const DeleteEventZod = z
  .object({
    id: z.coerce.number().int().positive(),
    action: z.enum(["all", "this", "future", "yes"]),
    recurrence_rule_id: z.coerce.number().int().positive().optional(),
    start_date: z.coerce.date(),
  })
  .superRefine((data, ctx) => {
    const isSeriesAction = ["all", "this", "future"].includes(data.action);
    if (isSeriesAction && !data.recurrence_rule_id) {
      ctx.addIssue({
        code: "custom",
        message: "The recurrence rule is required for this operation.",
        path: ["recurrence_rule_id"],
      });
    }
    if (!isSeriesAction && data.recurrence_rule_id) {
      ctx.addIssue({
        code: "custom",
        message: "A non-recurring deletion cannot include a recurrence rule.",
        path: ["recurrence_rule_id"],
      });
    }
  });
