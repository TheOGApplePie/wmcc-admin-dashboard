"use server";
import { Event as WMCCEvent } from "@/app/schemas/events";
import { ResponseCodes } from "@/app/enums/responseCodes";
import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../utils/supabase/server";
import z from "zod";
import {
  CreateEventZod,
  EditEventZod,
  DeleteEventZod,
} from "@/app/schemas/events";
import { ByWeekday, Frequency, RRule } from "rrule";

const actionClient = createSafeActionClient();

function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD") // Decompose accented characters
    .replaceAll(/[\u0300-\u036f]/g, "") // Remove accents
    .replaceAll(/[^a-zA-Z0-9._-]/g, "_"); // Replace special chars with underscore
}
export const createEvent = actionClient
  .inputSchema(CreateEventZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let storageUrl = parsedInput.poster_url || "";
      let recurringRuleID: number | undefined = undefined;
      const events = [];

      if (parsedInput.poster_file.length) {
        const fileUploaded = await uploadFile(
          new Date().toDateString() +
            "_" +
            sanitizeFilename(parsedInput.poster_file[0].name),
          parsedInput.poster_file[0],
        );

        if (fileUploaded.error) {
          throw new Error("ERROR UPLOADING " + fileUploaded.error.message);
        }

        if (fileUploaded.data.path.length) {
          const uploadedFile = supabase.storage
            .from("event-posters")
            .getPublicUrl(fileUploaded.data.path);
          storageUrl = uploadedFile.data.publicUrl;
        }
      }
      if (parsedInput.is_recurring && parsedInput.recurrence_rule) {
        const recurringRule = await supabase
          .from("recurrence_rule")
          .insert({
            frequency: parsedInput.recurrence_rule?.frequency,
            interval: parsedInput.recurrence_rule?.interval,
            by_weekdays: parsedInput.recurrence_rule?.by_weekdays,
            by_month_day: parsedInput.recurrence_rule?.by_month_day,
            by_set_position: parsedInput.recurrence_rule?.by_set_position,
            until: parsedInput.recurrence_rule?.until,
            count: parsedInput.recurrence_rule?.count,
          })
          .select("id");
        if (recurringRule.error) {
          throw new Error(
            "ERROR SETTING UP RECURRENCE " + recurringRule.error.message,
          );
        }

        recurringRuleID = recurringRule.data[0].id;
        const dtStart = toUTCWallClock(parsedInput.start_date);
        const rule = new RRule({
          freq: getFrequency(parsedInput.recurrence_rule.frequency!),
          interval: parsedInput.recurrence_rule.interval,
          byweekday: mapWeekdays(parsedInput.recurrence_rule.by_weekdays),
          bymonthday: parsedInput.recurrence_rule.by_month_day,
          bysetpos: parsedInput.recurrence_rule.by_set_position,
          ...(parsedInput.recurrence_rule.count && {
            count: parsedInput.recurrence_rule.count,
          }),
          dtstart: dtStart,
          ...(parsedInput.recurrence_rule.until && {
            until: new Date(parsedInput.recurrence_rule.until),
          }),
        });

        const difference =
          parsedInput.end_date.getTime() - parsedInput.start_date.getTime();
        rule.all().forEach((date) => {
          const startDate = new Date(date);
          const endDate = new Date(startDate.getTime() + difference);
          events.push({
            title: parsedInput.title,
            description: parsedInput.description,
            location: parsedInput.location,
            start_date: startDate,
            end_date: endDate,
            poster_url: storageUrl,
            poster_alt: parsedInput.poster_alt,
            call_to_action_link: parsedInput.call_to_action_link,
            call_to_action_caption: parsedInput.call_to_action_caption,
            is_recurring: parsedInput.is_recurring,
            recurrence_rule_id: recurringRuleID,
          });
        });
      }
      events.unshift({
        title: parsedInput.title,
        description: parsedInput.description,
        location: parsedInput.location,
        start_date: parsedInput.start_date,
        end_date: parsedInput.end_date,
        poster_url: storageUrl,
        poster_alt: parsedInput.poster_alt,
        call_to_action_link: parsedInput.call_to_action_link,
        call_to_action_caption: parsedInput.call_to_action_caption,
        is_recurring: parsedInput.is_recurring,
        recurrence_rule_id: recurringRuleID,
      });
      const { data, error, count } = await supabase
        .from("events")
        .insert(events);
      return {
        error: error?.message ?? "",
        data,
        count,
        status: ResponseCodes.SUCCESS,
        statusText: "Event created successfully!",
      };
    } catch (error) {
      console.error(error);

      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
        count: null,
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Internal Server Error",
      };
    }
  });

export const editEvent = actionClient
  .inputSchema(EditEventZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let storageUrl = parsedInput.poster_url || "";
      let recurringRuleID: number | undefined = parsedInput.recurrence_rule_id;
      const events = [];

      if (parsedInput.poster_file.length) {
        const fileUploaded = await uploadFile(
          new Date().toDateString() +
            "_" +
            sanitizeFilename(parsedInput.poster_file[0].name),
          parsedInput.poster_file[0],
        );

        if (fileUploaded.error) {
          throw new Error("ERROR UPLOADING " + fileUploaded.error.message);
        }

        if (fileUploaded.data.path.length) {
          const uploadedFile = supabase.storage
            .from("event-posters")
            .getPublicUrl(fileUploaded.data.path);
          storageUrl = uploadedFile.data.publicUrl;
        }
      }
      // If this used to be a recurring event, remove all instances and update the base instance
      if (
        !parsedInput.is_recurring &&
        !parsedInput.recurrence_rule &&
        recurringRuleID
      ) {
        // remove all instances of this event (except this one)
        await supabase
          .from("events")
          .delete()
          .eq("recurrence_rule_id", recurringRuleID)
          .neq("id", parsedInput.id);

        // remove the recurrence_rule
        await supabase
          .from("events")
          .update({ recurrence_rule_id: undefined })
          .eq("id", parsedInput.id);
        await supabase
          .from("recurrence_rule")
          .delete()
          .eq("id", recurringRuleID);

        // set the recurrenceRuleID to undefined
        recurringRuleID = undefined;
      } else if (parsedInput.is_recurring && parsedInput.recurrence_rule) {
        // if this is an existing rule and we are updating all instances, update the rule
        if (recurringRuleID && parsedInput.action === "all") {
          const recurringRule = await supabase
            .from("recurrence_rule")
            .update({
              frequency: parsedInput.recurrence_rule?.frequency,
              interval: parsedInput.recurrence_rule?.interval,
              by_weekdays: parsedInput.recurrence_rule?.by_weekdays,
              by_month_day: parsedInput.recurrence_rule?.by_month_day,
              by_set_position: parsedInput.recurrence_rule?.by_set_position,
              until: parsedInput.recurrence_rule?.until,
              count: parsedInput.recurrence_rule?.count,
            })
            .eq("id", recurringRuleID)
            .select("id");
          if (recurringRule.error) {
            throw new Error(
              "ERROR UPDATING RECURRENCE " + recurringRule.error.message,
            );
          }
        } else if (!recurringRuleID || parsedInput.action === "future") {
          // This is a new recurrence, or we are editing only future events, so generate a new rule
          const recurringRule = await supabase
            .from("recurrence_rule")
            .insert({
              frequency: parsedInput.recurrence_rule?.frequency,
              interval: parsedInput.recurrence_rule?.interval,
              by_weekdays: parsedInput.recurrence_rule?.by_weekdays,
              by_month_day: parsedInput.recurrence_rule?.by_month_day,
              by_set_position: parsedInput.recurrence_rule?.by_set_position,
              until: parsedInput.recurrence_rule?.until,
              count: parsedInput.recurrence_rule?.count,
            })
            .select("id");
          if (recurringRule.error) {
            throw new Error(
              "ERROR UPDATING RECURRENCE " + recurringRule.error.message,
            );
          }
          recurringRuleID = recurringRule.data[0].id;
        }
        if (parsedInput.action !== "single") {
          const dtStart = toUTCWallClock(parsedInput.start_date);
          const rule = new RRule({
            freq: getFrequency(parsedInput.recurrence_rule.frequency!),
            interval: parsedInput.recurrence_rule.interval || undefined,
            byweekday: mapWeekdays(parsedInput.recurrence_rule.by_weekdays),
            bymonthday: parsedInput.recurrence_rule.by_month_day,
            bysetpos: parsedInput.recurrence_rule.by_set_position,
            count: parsedInput.recurrence_rule.count,
            dtstart: dtStart,
            until: parsedInput.recurrence_rule.until
              ? new Date(parsedInput.recurrence_rule.until)
              : undefined,
          });

          const difference =
            parsedInput.end_date.getTime() - parsedInput.start_date.getTime();
          rule.all().forEach((date) => {
            const startDate = new Date(date);
            const endDate = new Date(startDate.getTime() + difference);
            events.push({
              title: parsedInput.title,
              description: parsedInput.description,
              location: parsedInput.location,
              start_date: startDate,
              end_date: endDate,
              poster_url: storageUrl,
              poster_alt: parsedInput.poster_alt,
              call_to_action_link: parsedInput.call_to_action_link,
              call_to_action_caption: parsedInput.call_to_action_caption,
              is_recurring: parsedInput.is_recurring,
              recurrence_rule_id: recurringRuleID,
            });
          });
        }
      }
      events.unshift({
        title: parsedInput.title,
        description: parsedInput.description,
        location: parsedInput.location,
        start_date: parsedInput.start_date,
        end_date: parsedInput.end_date,
        poster_url: storageUrl,
        poster_alt: parsedInput.poster_alt,
        call_to_action_link: parsedInput.call_to_action_link,
        call_to_action_caption: parsedInput.call_to_action_caption,
        is_recurring: parsedInput.is_recurring,
        recurrence_rule_id: recurringRuleID,
      });

      if (parsedInput.recurrence_rule_id && parsedInput.action !== "single") {
        let deleteQuery = supabase
          .from("events")
          .delete()
          .eq("recurrence_rule_id", parsedInput.recurrence_rule_id);
        if (parsedInput.action === "future") {
          const startDate = new Date(parsedInput.start_date).toISOString();
          deleteQuery = deleteQuery.gte("start_date", startDate);
        }
        const deletedEvents = await deleteQuery;
        if (deletedEvents.error) {
          throw new Error(
            "ERROR DELETING OLD RECURRING EVENTS " +
              deletedEvents.error.message,
          );
        }
        const addedEvents = await supabase.from("events").insert(events);
        return {
          error: addedEvents.error?.message ?? "",
          data: addedEvents.data,
          count: addedEvents.count,
          status: ResponseCodes.SUCCESS,
          statusText: "Event created successfully!",
        };
      } else {
        const { data, error, count } = await supabase
          .from("events")
          .update(events[0])
          .eq("id", parsedInput.id);
        return {
          error: error?.message ?? "",
          data,
          count,
          status: ResponseCodes.SUCCESS,
          statusText: "Event created successfully!",
        };
      }
    } catch (error) {
      console.error(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
        count: null,
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Internal Server Error",
      };
    }
  });
const toUTCWallClock = (date: Date) => {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  );
};
const getFrequency = (frequency: string) => {
  if (frequency === "day") {
    return Frequency.DAILY;
  } else if (frequency === "week") {
    return Frequency.WEEKLY;
  } else {
    return Frequency.MONTHLY;
  }
};

const mapWeekdays = (weekdays?: string[]) => {
  const weekdayArray: ByWeekday[] = [];
  if (weekdays) {
    if (weekdays.includes("SU")) weekdayArray.push(RRule.SU);
    if (weekdays.includes("MO")) weekdayArray.push(RRule.MO);
    if (weekdays.includes("TU")) weekdayArray.push(RRule.TU);
    if (weekdays.includes("WE")) weekdayArray.push(RRule.WE);
    if (weekdays.includes("TH")) weekdayArray.push(RRule.TH);
    if (weekdays.includes("FR")) weekdayArray.push(RRule.FR);
    if (weekdays.includes("SA")) weekdayArray.push(RRule.SA);
  }
  return weekdayArray;
};

export const deleteEvent = actionClient
  .inputSchema(DeleteEventZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let query = supabase.from("events").delete();
      if (parsedInput.recurrence_rule_id && parsedInput.action === "future") {
        const startDate = new Date(parsedInput.start_date).toDateString();
        query = query
          .gte("start_date", startDate)
          .eq("recurrence_rule_id", parsedInput.recurrence_rule_id);
      } else if (
        parsedInput.recurrence_rule_id &&
        parsedInput.action === "all"
      ) {
        query = query.eq("recurrence_rule_id", parsedInput.recurrence_rule_id);
      } else {
        query = query.eq("id", parsedInput.id);
      }
      const deletedEvents = await query;
      return {
        error: deletedEvents.error?.message ?? "",
        data: deletedEvents.data,
        count: deletedEvents.count,
        status: ResponseCodes.SUCCESS,
        statusText: deletedEvents.statusText,
      };
    } catch (error) {
      console.error(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
        count: null,
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Internal Server Error",
      };
    }
  });

export const filterEvents = actionClient
  .inputSchema(
    z.object({
      search: z.string(),
      currentPage: z.coerce.number(),
      pageSize: z.coerce.number(),
      startDate: z.optional(z.coerce.date()),
      endDate: z.optional(z.coerce.date()),
    }),
  )
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let query = supabase
        .from("events")
        .select(
          `id,
        title,
        start_date,
        end_date,
        poster_url,
        call_to_action_link,
        description,
        location,
        poster_alt,
        call_to_action_caption,
        created_at,
        recurrence_rule_id,
        is_recurring,
        recurrence_rule (id,
        frequency,
        interval,
        by_weekdays,
        by_month_day,
        by_set_position,
        until,
        count)`,
          { count: "exact" },
        )
        .range(
          (parsedInput.currentPage - 1) * parsedInput.pageSize,
          (parsedInput.currentPage - 1) * parsedInput.pageSize +
            parsedInput.pageSize -
            1,
        )
        .order("start_date", { ascending: true });

      if (parsedInput.search.length) {
        query = query.ilike("title", `%${parsedInput.search}%`);
      }
      if (parsedInput.startDate?.toDateString().length) {
        const startDate = new Date(parsedInput.startDate).toDateString();
        query = query.gte("start_date", startDate);
      }
      if (parsedInput.endDate?.toDateString().length) {
        const endDate = new Date(parsedInput.endDate).toDateString();
        query = query.lte("start_date", endDate);
      }

      const { data: events, count: count } =
        await query.overrideTypes<WMCCEvent[]>();

      return {
        error: null,
        data: { events, count },
      };
    } catch (error) {
      console.error(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        data: {},
      };
    }
  });

const uploadFile = async (name: string, file: z.core.File) => {
  const supabase = await createClient();

  const fileUploaded = await supabase.storage
    .from("event-posters")
    .upload(`public/${name}`, file);
  return fileUploaded;
};
