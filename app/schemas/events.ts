import { z } from "zod";
import { FIVE_MB } from "../constants/general";
import { ByWeekday } from "rrule";

export interface Event {
  id: number;
  title: string;
  description: string;
  location: string;
  poster_url: string | null;
  poster_file: File[] | null;
  poster_alt: string;
  call_to_action_link: string | null;
  call_to_action_caption: string;
  start_date: Date | string;
  end_date: Date | string;
  action: string;
  gallery_url: string | null;
  is_recurring: boolean;
  recurrence_rule_id?: number;
  recurrence_rule?: {
    frequency: string;
    interval: number | null;
    by_weekdays: ByWeekday[]; // e.g. ["MO","WE"] for Mon/Wed
    by_month_day: number | null; // e.g. 2 for "2nd of each month"
    by_set_position?: number[]; // e.g. 1 for "1st", -1 for "last"
    until: Date | string | null; // Date limit
    count: number | null; // Occurrences limit
  };
}

// Strips a Date to its UTC calendar day string (YYYY-MM-DD) for date-only comparisons.
const toUTCDateStr = (d: Date | string) =>
  new Date(d).toISOString().split("T")[0];

const recurrenceRuleShape = {
  frequency: z.string(),
  interval: z.coerce.number().nullable(),
  by_weekdays: z.array(z.coerce.string()).optional(),
  by_month_day: z.coerce.number().min(1).max(31).nullable(),
  by_set_position: z.array(z.coerce.number().min(-2).max(2)).optional(),
  until: z.coerce.date().nullable(),
  count: z.coerce.number().min(2).max(20).nullable(),
};

// ─── Shared validation helpers ────────────────────────────────────────────────

function validatePoster(
  data: {
    poster_file?: File[] | null;
    poster_url: string | null;
    poster_alt: string;
  },
  ctx: z.RefinementCtx,
) {
  if (data.poster_file?.length) {
    const image = data.poster_file[0];
    if (image.size > FIVE_MB) {
      ctx.addIssue({
        code: "custom",
        message:
          "The file you are uploading is too large. Please upload an image less than 5MB.",
        path: ["poster_file"],
      });
    } else if (
      !["image/jpeg", "image/jpg", "image/png"].includes(image.type)
    ) {
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
  } else if (!data.poster_file?.length && !data.poster_url && data.poster_alt) {
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
  if (rule.frequency === "day") {
    if (!rule.interval || rule.interval < 1 || rule.interval > 20) {
      ctx.addIssue({
        code: "custom",
        message:
          "Please make sure the interval of the recurrence is between 1 and 20",
        path: ["recurrence_rule.interval"],
      });
    }
  } else if (rule.frequency === "week") {
    if (!rule.by_weekdays?.length) {
      ctx.addIssue({
        code: "custom",
        message:
          "Please provide the days of the week you want this event to repeat on.",
        path: ["recurrence_rule.by_weekdays"],
      });
    }
  } else if (rule.frequency === "month") {
    if (
      !rule.by_month_day &&
      !rule.by_weekdays?.length &&
      !rule.by_set_position?.length
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "For the monthly recurrence period, you must either provide a month date, or, you must provide (a) month week(s) and weekday(s).",
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

  if (!rule.frequency || !["day", "week", "month"].includes(rule.frequency)) {
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

  if (rule.until) {
    const untilDay = toUTCDateStr(rule.until);
    const todayDay = toUTCDateStr(new Date());
    const endDateDay = toUTCDateStr(data.end_date);
    if (untilDay <= todayDay) {
      ctx.addIssue({
        code: "custom",
        message: "Please provide a termination date that is in the future.",
        path: ["recurrence_rule.until"],
      });
    } else if (untilDay < endDateDay) {
      ctx.addIssue({
        code: "custom",
        message:
          "The recurrence end date must be on or after the event's end date.",
        path: ["recurrence_rule.until"],
      });
    }
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateEventZod = z
  .object({
    id: z.coerce.number().optional(),
    title: z.string().trim().max(50),
    description: z.nullable(z.string().trim().max(100)),
    location: z.string().trim().max(100),
    poster_url: z.nullable(z.url()),
    poster_file: z.array(z.file()),
    poster_alt: z.string().trim().max(100),
    call_to_action_link: z.nullable(z.url()),
    call_to_action_caption: z.nullable(z.string().max(20)),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    gallery_url: z.preprocess(
      (v) => (v === "" ? null : v),
      z.nullable(z.url()),
    ),
    is_recurring: z.boolean(),
    created_at: z.optional(z.coerce.date()),
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
    validateRecurrenceRule(data, ctx);
  });

export const EditEventZod = z
  .object({
    id: z.coerce.number().optional(),
    title: z.string().trim().max(50),
    description: z.nullable(z.string().trim().max(100)),
    location: z.string().trim().max(100),
    poster_url: z.nullable(z.url()),
    poster_file: z.array(z.file()),
    poster_alt: z.string().trim().max(100),
    call_to_action_link: z.nullable(z.url()),
    call_to_action_caption: z.nullable(z.string().max(20)),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    action: z.string(),
    is_recurring: z.boolean(),
    recurrence_rule_id: z.coerce.number().optional(),
    gallery_url: z.preprocess(
      (v) => (v === "" ? null : v),
      z.nullable(z.url()),
    ),
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
    if (data.id && data.is_recurring) {
      validateRecurrenceRule(data, ctx);
    }
  });

export const DeleteEventZod = z.object({
  id: z.coerce.number(),
  action: z.string(),
  recurrence_rule_id: z.coerce.number().optional(),
  start_date: z.coerce.date(),
});
