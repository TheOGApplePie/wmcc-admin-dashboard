"use server";
import {
  FCRRuleInput,
  RecurrenceRule,
  Event as WMCCEvent,
} from "@/app/schemas/events";
import { ResponseCodes } from "@/app/enums/responseCodes";
import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../utils/supabase/server";
import z from "zod";
import {
  CreateEventZod,
  EditEventZod,
  DeleteEventZod,
} from "@/app/schemas/events";
import { logAudit } from "@/utils/audit";
import { resolveStorageUrl } from "@/utils/uploadFiles";
import { SupabaseClient } from "@supabase/supabase-js";

const actionClient = createSafeActionClient();

export const createEvent = actionClient
  .inputSchema(CreateEventZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const storageUrl = await resolveStorageUrl(
        supabase,
        parsedInput.poster_file,
        parsedInput.poster_url,
        parsedInput.title,
      );

      let recurringRuleID: number | undefined = undefined;

      if (parsedInput.is_recurring && parsedInput.recurrence_rule) {
        const ruleResult = await supabase
          .from("recurrence_rule")
          .insert({
            frequency: parsedInput.recurrence_rule.frequency,
            interval: parsedInput.recurrence_rule.interval,
            by_weekdays: parsedInput.recurrence_rule.by_weekdays,
            by_month_day: parsedInput.recurrence_rule.by_month_day,
            by_set_position: parsedInput.recurrence_rule.by_set_position,
            until: parsedInput.recurrence_rule.until,
            count: parsedInput.recurrence_rule.count,
          })
          .select("id");
        if (ruleResult.error)
          throw new Error(
            "ERROR SETTING UP RECURRENCE " + ruleResult.error.message,
          );
        recurringRuleID = ruleResult.data[0].id;
      }

      const { data, error } = await supabase
        .from("events")
        .insert({
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
          navigation_slug: parsedInput.navigation_slug,
        })
        .select("id")
        .single();

      if (!error && data)
        await logAudit(supabase, "event", data.id, "create", parsedInput.title);

      return {
        error: error?.message ?? "",
        data,
        count: null,
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
      const storageUrl = await resolveStorageUrl(
        supabase,
        parsedInput.poster_file,
        parsedInput.poster_url,
        parsedInput.title,
      );

      const commonFields = {
        title: parsedInput.title,
        description: parsedInput.description,
        location: parsedInput.location,
        poster_url: storageUrl,
        poster_alt: parsedInput.poster_alt,
        call_to_action_link: parsedInput.call_to_action_link,
        call_to_action_caption: parsedInput.call_to_action_caption,
        navigation_slug: parsedInput.navigation_slug,
      };

      // Recurring → non-recurring: remove all sibling rows and orphaned rule
      if (!parsedInput.is_recurring && parsedInput.recurrence_rule_id) {
        await supabase
          .from("events")
          .delete()
          .eq("recurrence_rule_id", parsedInput.recurrence_rule_id)
          .neq("id", parsedInput.id);
        await supabase
          .from("events")
          .update({
            ...commonFields,
            start_date: parsedInput.start_date,
            end_date: parsedInput.end_date,
            is_recurring: false,
            recurrence_rule_id: null,
          })
          .eq("id", parsedInput.id);
        await supabase
          .from("recurrence_rule")
          .delete()
          .eq("id", parsedInput.recurrence_rule_id);
        if (parsedInput.id)
          await logAudit(
            supabase,
            "event",
            parsedInput.id,
            "update",
            "removed recurrence",
          );
        return {
          error: "",
          data: null,
          count: null,
          status: ResponseCodes.SUCCESS,
          statusText: "Event updated successfully!",
        };
      }

      const { action } = parsedInput;

      if (action === "all") {
        const { error } = await supabase
          .from("events")
          .update({
            ...commonFields,
            start_date: parsedInput.start_date,
            end_date: parsedInput.end_date,
          })
          .eq("id", parsedInput.id);
        if (error) throw new Error(error.message);

        if (parsedInput.recurrence_rule && parsedInput.recurrence_rule_id) {
          const { error: ruleError } = await supabase
            .from("recurrence_rule")
            .update({
              frequency: parsedInput.recurrence_rule.frequency,
              interval: parsedInput.recurrence_rule.interval,
              by_weekdays: parsedInput.recurrence_rule.by_weekdays,
              by_month_day: parsedInput.recurrence_rule.by_month_day,
              by_set_position: parsedInput.recurrence_rule.by_set_position,
              until: parsedInput.recurrence_rule.until,
              count: parsedInput.recurrence_rule.count,
            })
            .eq("id", parsedInput.recurrence_rule_id);
          if (ruleError) throw new Error(ruleError.message);
        }
      } else if (action === "future") {
        const occDate = parsedInput.occurrence_date!;
        const dayBefore = new Date(occDate);
        dayBefore.setDate(dayBefore.getDate() - 1);

        await supabase
          .from("recurrence_rule")
          .update({ until: dayBefore.toISOString().split("T")[0] })
          .eq("id", parsedInput.recurrence_rule_id);

        const newRuleResult = await supabase
          .from("recurrence_rule")
          .insert({
            frequency: parsedInput.recurrence_rule!.frequency,
            interval: parsedInput.recurrence_rule!.interval,
            by_weekdays: parsedInput.recurrence_rule!.by_weekdays,
            by_month_day: parsedInput.recurrence_rule!.by_month_day,
            by_set_position: parsedInput.recurrence_rule!.by_set_position,
            until: parsedInput.recurrence_rule!.until,
            count: parsedInput.recurrence_rule!.count,
          })
          .select("id");
        if (newRuleResult.error)
          throw new Error(
            "ERROR CREATING NEW RULE " + newRuleResult.error.message,
          );

        await supabase.from("events").insert({
          ...commonFields,
          start_date: parsedInput.start_date,
          end_date: parsedInput.end_date,
          is_recurring: true,
          recurrence_rule_id: newRuleResult.data[0].id,
        });
      } else if (action === "single" && parsedInput.recurrence_rule_id) {
        // Edit a single occurrence of an existing recurring series
        const exdateStr = parsedInput
          .occurrence_date!.toISOString()
          .split("T")[0];

        const ruleResult = await supabase
          .from("recurrence_rule")
          .select("exdates")
          .eq("id", parsedInput.recurrence_rule_id)
          .single();
        const currentExdates: string[] = ruleResult.data?.exdates ?? [];

        await supabase
          .from("recurrence_rule")
          .update({ exdates: [...currentExdates, exdateStr] })
          .eq("id", parsedInput.recurrence_rule_id);

        await supabase.from("events").insert({
          ...commonFields,
          start_date: parsedInput.start_date,
          end_date: parsedInput.end_date,
          is_recurring: false,
          recurrence_rule_id: null,
        });
      } else {
        // Handles: plain non-recurring edit, and non-recurring → recurring conversion
        let newRecurrenceRuleId: number | undefined = undefined;
        if (
          parsedInput.is_recurring &&
          parsedInput.recurrence_rule &&
          !parsedInput.recurrence_rule_id
        ) {
          const ruleResult = await supabase
            .from("recurrence_rule")
            .insert({
              frequency: parsedInput.recurrence_rule.frequency,
              interval: parsedInput.recurrence_rule.interval,
              by_weekdays: parsedInput.recurrence_rule.by_weekdays,
              by_month_day: parsedInput.recurrence_rule.by_month_day,
              by_set_position: parsedInput.recurrence_rule.by_set_position,
              until: parsedInput.recurrence_rule.until,
              count: parsedInput.recurrence_rule.count,
            })
            .select("id");
          if (ruleResult.error) throw new Error(ruleResult.error.message);
          newRecurrenceRuleId = ruleResult.data[0].id;
        }
        const { error } = await supabase
          .from("events")
          .update({
            ...commonFields,
            start_date: parsedInput.start_date,
            end_date: parsedInput.end_date,
            is_recurring: parsedInput.is_recurring,
            ...(newRecurrenceRuleId && {
              recurrence_rule_id: newRecurrenceRuleId,
            }),
          })
          .eq("id", parsedInput.id);
        if (error) throw new Error(error.message);
      }

      if (parsedInput.id)
        await logAudit(
          supabase,
          "event",
          parsedInput.id,
          "update",
          parsedInput.action ?? "single",
        );

      return {
        error: "",
        data: null,
        count: null,
        status: ResponseCodes.SUCCESS,
        statusText: "Event updated successfully!",
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

export const deleteEvent = actionClient
  .inputSchema(DeleteEventZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      if (parsedInput.action === "all" && parsedInput.recurrence_rule_id) {
        await supabase.from("events").delete().eq("id", parsedInput.id);
        await supabase
          .from("recurrence_rule")
          .delete()
          .eq("id", parsedInput.recurrence_rule_id);
      } else if (
        parsedInput.action === "future" &&
        parsedInput.recurrence_rule_id
      ) {
        const dayBefore = new Date(parsedInput.start_date);
        dayBefore.setDate(dayBefore.getDate() - 1);
        await supabase
          .from("recurrence_rule")
          .update({ until: dayBefore.toISOString().split("T")[0] })
          .eq("id", parsedInput.recurrence_rule_id);
      } else if (
        parsedInput.action === "this" &&
        parsedInput.recurrence_rule_id
      ) {
        const exdateStr = parsedInput.start_date.toISOString().split("T")[0];
        const ruleResult = await supabase
          .from("recurrence_rule")
          .select("exdates")
          .eq("id", parsedInput.recurrence_rule_id)
          .single();
        const currentExdates: string[] = ruleResult.data?.exdates ?? [];
        await supabase
          .from("recurrence_rule")
          .update({ exdates: [...currentExdates, exdateStr] })
          .eq("id", parsedInput.recurrence_rule_id);
      } else {
        await supabase.from("events").delete().eq("id", parsedInput.id);
      }

      await logAudit(
        supabase,
        "event",
        parsedInput.id,
        "delete",
        parsedInput.action,
      );

      return {
        error: "",
        data: null,
        count: null,
        status: ResponseCodes.SUCCESS,
        statusText: "Event deleted successfully!",
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

export const fetchAllEvents = actionClient
  .inputSchema(
    z.object({
      rangeStart: z.date(),
      rangeEnd: z.date(),
    }),
  )
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const startIso = parsedInput.rangeStart.toISOString();
      const endIso = parsedInput.rangeEnd.toISOString();

      const [singleResult, recurringResult] = await Promise.all([
        fetchSingleEvents(supabase, startIso, endIso),
        fetchRecurringEvents(supabase, startIso, endIso),
      ]);

      if (singleResult.error) {
        throw singleResult.error;
      }

      if (recurringResult.error) {
        throw recurringResult.error;
      }

      const singleOccurrences =
        singleResult.data?.map((ev) => ({
          ...ev,
          id: String(ev.id),
          start: ev.start_date,
          end: ev.end_date,
        })) ?? [];

      const recurringOccurrences =
        recurringResult.data?.map((ev) => {
          const rule = Array.isArray(ev.recurrence_rule)
            ? ev.recurrence_rule[0]
            : ev.recurrence_rule;
          return {
            ...ev,
            id: String(ev.id),
            start: ev.start_date,
            end: ev.end_date,
            rrule: buildRRuleObj(ev.start_date, rule),
            duration: calcDuration(ev.start_date, ev.end_date),
            exdate: rule.exdates?.map(toFloatingToronto) ?? [],
          };
        }) ?? [];

      return [...singleOccurrences, ...recurringOccurrences].sort(
        (a, b) => a.start - b.start,
      );
    } catch (error) {
      console.error(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  });
function fetchSingleEvents(
  supabase: SupabaseClient,
  rangeStartIso: string,
  rangeEndIso: string,
) {
  return supabase
    .from("events")
    .select(
      `
      id,
      title,
      start_date,
      end_date,
      description,
      location,
      poster_url,
      poster_alt,
      call_to_action_link,
      call_to_action_caption,
      gallery_url,
      navigation_slug
    `,
    )
    .eq("is_recurring", false)
    .lt("start_date", rangeEndIso)
    .gt("end_date", rangeStartIso);
}
function fetchRecurringEvents(
  supabase: SupabaseClient,
  rangeStartIso: string,
  rangeEndIso: string,
) {
  return supabase
    .from("events")
    .select(
      `
      id,
      title,
      start_date,
      end_date,
      description,
      location,
      poster_url,
      poster_alt,
      call_to_action_link,
      call_to_action_caption,
      gallery_url,
      navigation_slug,
      recurrence_rule!inner (
        id,
        frequency,
        interval,
        by_month_day,
        until,
        count,
        by_weekdays,
        by_set_position,
        exdates,
        last_occurence_at
      )
    `,
    )
    .eq("is_recurring", true)
    .lt("start_date", rangeEndIso)
    .or(`last_occurence_at.is.null,last_occurence_at.gte.${rangeStartIso}`, {
      referencedTable: "recurrence_rule",
    });
}
const buildRRuleObj = (dtstart: string, rule: RecurrenceRule): FCRRuleInput => {
  const options: FCRRuleInput = {
    freq: rule.frequency.toUpperCase(),
    dtstart: toFloatingToronto(dtstart),
  };
  if (rule.interval && rule.interval > 1) options.interval = rule.interval;
  if (rule.by_weekdays?.length) options.byweekday = rule.by_weekdays;
  if (rule.by_month_day) options.bymonthday = rule.by_month_day;
  if (rule.by_set_position?.length) options.bysetpos = rule.by_set_position;
  if (rule.until) options.until = toFloatingToronto(rule.until);
  if (rule.count) options.count = rule.count;
  return options;
};

const calcDuration = (start: string, end: string): string => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const toFloatingToronto = (isoDate: string): string => {
  const date = new Date(isoDate);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
};
