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
  is_recurring: boolean;
  recurrence_rule_id?: number;
  recurrence_rule?: {
    frequency: string;
    interval: number | null;
    by_weekdays: ByWeekday[]; // e.g. [2,4] for Tue/Thu
    by_month_day: number | null; // e.g. 2 for "2nd of each month"
    by_set_position: number[]; // e.g. 1 for "1st", -1 for "last"
    until: Date | string | null; // Date limit
    count: number | null; // Occurrences limit
  };
}
export const CreateEventZod = z
  .object({
    id: z.coerce.number().optional(),
    title: z.string().trim().max(50),
    description: z.nullable(z.string().trim().max(100)),
    location: z.string().trim().max(100),
    poster_url: z.nullable(z.url()),
    poster_file: z.array(z.file()),
    poster_alt: z.string().trim().max(50),
    call_to_action_link: z.nullable(z.url()),
    call_to_action_caption: z.nullable(z.string().max(20)),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    is_recurring: z.boolean(),
    created_at: z.optional(z.coerce.date()),
    recurrence_rule: z
      .object({
        frequency: z.string(),
        interval: z.coerce.number(),
        by_weekdays: z.array(z.coerce.string()), // e.g. [2,4] for Tue/Thu
        by_month_day: z.coerce.number().min(1).max(31).nullable(), // e.g. 2 for "2nd of each month"
        by_set_position: z.array(z.coerce.number().min(-2).max(2)), // e.g. 1 for "1st", -1 for "last"
        until: z.coerce.date().nullable(), // Date limit
        count: z.coerce.number().min(2).max(20).nullable(), // Occurrences limit
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.end_date <= data.start_date) {
      ctx.addIssue({
        code: "custom",
        message: "The end date of the event must be after the start date.",
        path: ["end_date"],
      });
    }
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
      }
    } else if (
      (data.poster_file?.length || data.poster_url) &&
      !data.poster_alt
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The poster alt is required when specifying a picture.",
        path: ["poster_alt"],
      });
    } else if (
      !data.poster_file?.length &&
      !data.poster_url &&
      data.poster_alt
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Please specify an image or remove the caption.",
        path: ["poster_url", "poster_file"],
      });
    }
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
    if (data.id && data.is_recurring) {
      if (
        !data.recurrence_rule?.frequency ||
        !["day", "week", "month"].includes(data.recurrence_rule.frequency)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Please specify a recurrence period that is either daily, weekly, or monthly",
          path: ["recurrence_rule.frequency"],
        });
      }
      if (
        data.recurrence_rule?.frequency === "day" &&
        (!data.recurrence_rule.interval ||
          (data.recurrence_rule.interval &&
            (2 > data.recurrence_rule.interval ||
              data.recurrence_rule.interval > 20)))
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Please make sure the interval of the recurrence is between 2 and 20",
          path: ["recurrence_rule.interval"],
        });
      } else if (data.recurrence_rule?.frequency === "week") {
        if (
          !data.recurrence_rule.by_weekdays ||
          !data.recurrence_rule.by_weekdays.length
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "Please provide the days of the week you want this event to repeat on.",
            path: ["recurrence_rule.by_weekdays"],
          });
        }
      } else {
        if (
          !data.recurrence_rule?.by_month_day &&
          (!data.recurrence_rule?.by_weekdays ||
            (data.recurrence_rule.by_weekdays &&
              !data.recurrence_rule.by_weekdays.length)) &&
          (!data.recurrence_rule?.by_set_position ||
            (data.recurrence_rule.by_set_position &&
              !data.recurrence_rule.by_set_position.length))
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "For the monthly recurrence period, you must either provide a month date, or, you must provide (a) month week(s) and weekday(s).",
            path: ["recurrence_rule.frequency"],
          });
        }
      }
      if (!data.recurrence_rule?.until && !data.recurrence_rule?.count) {
        ctx.addIssue({
          code: "custom",
          message:
            "Please provide either a number of occurences or a termination date. At this time, unlimited recurrences are not supported.",
          path: ["recurrence_rule"],
        });
      }
      if (data.recurrence_rule?.until) {
        const date = data.recurrence_rule.until;
        const endDate = data.end_date;
        const today = new Date();
        if (date < today || date < endDate) {
          ctx.addIssue({
            code: "custom",
            message: "Please provide a termination date that is in the future.",
            path: ["recurrence_rule.until"],
          });
        }
      }
    }
  });

export const EditEventZod = z
  .object({
    id: z.coerce.number().optional(),
    title: z.string().trim().max(50),
    description: z.nullable(z.string().trim().max(100)),
    location: z.string().trim().max(100),
    poster_url: z.nullable(z.url()),
    poster_file: z.array(z.file()),
    poster_alt: z.string().trim().max(50),
    call_to_action_link: z.nullable(z.url()),
    call_to_action_caption: z.nullable(z.string().max(20)),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    action: z.string(),
    is_recurring: z.boolean(),
    recurrence_rule_id: z.coerce.number().optional(),
    recurrence_rule: z
      .object({
        frequency: z.string(),
        interval: z.coerce.number(),
        by_weekdays: z.array(z.coerce.string()), // e.g. [2,4] for Tue/Thu
        by_month_day: z.coerce.number().min(1).max(31).nullable(), // e.g. 2 for "2nd of each month"
        by_set_position: z.array(z.coerce.number().min(-2).max(2)), // e.g. 1 for "1st", -1 for "last"
        until: z.coerce.date().nullable(), // Date limit
        count: z.coerce.number().min(2).max(20).nullable(), // Occurrences limit
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.end_date <= data.start_date) {
      ctx.addIssue({
        code: "custom",
        message: "The end date of the event must be after the start date.",
        path: ["end_date"],
      });
    }
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
      }
    } else if (
      (data.poster_file?.length || data.poster_url) &&
      !data.poster_alt
    ) {
      ctx.addIssue({
        code: "custom",
        message: "The poster alt is required when specifying a picture.",
        path: ["poster_alt"],
      });
    } else if (
      !data.poster_file?.length &&
      !data.poster_url &&
      data.poster_alt
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Please specify an image or remove the caption.",
        path: ["poster_url", "poster_file"],
      });
    }
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
    if (data.id && data.is_recurring) {
      if (
        !data.recurrence_rule?.frequency ||
        !["day", "week", "month"].includes(data.recurrence_rule.frequency)
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Please specify a recurrence period that is either daily, weekly, or monthly",
          path: ["recurrence_rule.frequency"],
        });
      }
      if (
        data.recurrence_rule?.frequency === "day" &&
        (!data.recurrence_rule.interval ||
          (data.recurrence_rule.interval &&
            (2 > data.recurrence_rule.interval ||
              data.recurrence_rule.interval > 20)))
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Please make sure the interval of the recurrence is between 2 and 20",
          path: ["recurrence_rule.interval"],
        });
      } else if (data.recurrence_rule?.frequency === "week") {
        if (
          !data.recurrence_rule.by_weekdays ||
          !data.recurrence_rule.by_weekdays.length
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "Please provide the days of the week you want this event to repeat on.",
            path: ["recurrence_rule.by_weekdays"],
          });
        }
      } else {
        if (
          !data.recurrence_rule?.by_month_day &&
          (!data.recurrence_rule?.by_weekdays ||
            (data.recurrence_rule.by_weekdays &&
              !data.recurrence_rule.by_weekdays.length)) &&
          (!data.recurrence_rule?.by_set_position ||
            (data.recurrence_rule.by_set_position &&
              !data.recurrence_rule.by_set_position.length))
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "For the monthly recurrence period, you must either provide a month date, or, you must provide (a) month week(s) and weekday(s).",
            path: ["recurrence_rule.frequency"],
          });
        }
      }
      if (!data.recurrence_rule?.until && !data.recurrence_rule?.count) {
        ctx.addIssue({
          code: "custom",
          message:
            "Please provide either a number of occurences or a termination date. At this time, unlimited recurrences are not supported.",
          path: ["recurrence_rule"],
        });
      }
      if (data.recurrence_rule?.until) {
        const date = data.recurrence_rule.until;
        const endDate = data.end_date;
        const today = new Date();
        if (date < today || date < endDate) {
          ctx.addIssue({
            code: "custom",
            message: "Please provide a termination date that is in the future.",
            path: ["recurrence_rule.until"],
          });
        }
      }
    }
  });
export const DeleteEventZod = z.object({
  id: z.coerce.number(),
  action: z.string(),
  recurrence_rule_id: z.coerce.number().optional(),
  start_date: z.coerce.date(),
});
