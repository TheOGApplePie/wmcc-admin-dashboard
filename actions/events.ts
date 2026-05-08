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

const actionClient = createSafeActionClient();

function titleToFilename(title: string, ext: string): string {
  const base = title
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();
  return `${base}.${ext}`;
}

async function resolveStorageUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  posterFile: File[],
  posterUrl: string | null,
  title: string,
): Promise<string> {
  if (posterFile.length) {
    const file = posterFile[0];
    const ext = file.name.split(".").pop() ?? "jpg";
    const baseFilename = titleToFilename(title, ext);
    const baseName = baseFilename.slice(0, -(ext.length + 1));

    const { data: existingFiles } = await supabase.storage
      .from("event-posters")
      .list("public");
    const existingNames = new Set((existingFiles ?? []).map((f) => f.name));

    let finalName = baseFilename;
    let count = 1;
    while (existingNames.has(finalName)) {
      finalName = `${baseName}-${count}.${ext}`;
      count++;
    }

    const uploaded = await supabase.storage
      .from("event-posters")
      .upload(`public/${finalName}`, file);
    if (uploaded.error) throw new Error("ERROR UPLOADING " + uploaded.error.message);
    if (uploaded.data.path.length) {
      return supabase.storage
        .from("event-posters")
        .getPublicUrl(uploaded.data.path).data.publicUrl;
    }
  }
  return posterUrl || "";
}

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
          throw new Error("ERROR SETTING UP RECURRENCE " + ruleResult.error.message);
        recurringRuleID = ruleResult.data[0].id;
      }

      const { data, error, count } = await supabase.from("events").insert({
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
          throw new Error("ERROR CREATING NEW RULE " + newRuleResult.error.message);

        await supabase.from("events").insert({
          ...commonFields,
          start_date: parsedInput.start_date,
          end_date: parsedInput.end_date,
          is_recurring: true,
          recurrence_rule_id: newRuleResult.data[0].id,
        });
      } else if (action === "single" && parsedInput.recurrence_rule_id) {
        // Edit a single occurrence of an existing recurring series
        const exdateStr = parsedInput.occurrence_date!.toISOString().split("T")[0];

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
      } else if (parsedInput.action === "future" && parsedInput.recurrence_rule_id) {
        const dayBefore = new Date(parsedInput.start_date);
        dayBefore.setDate(dayBefore.getDate() - 1);
        await supabase
          .from("recurrence_rule")
          .update({ until: dayBefore.toISOString().split("T")[0] })
          .eq("id", parsedInput.recurrence_rule_id);
      } else if (parsedInput.action === "this" && parsedInput.recurrence_rule_id) {
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
  .inputSchema(z.object({ search: z.string().optional() }))
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let query = supabase.from("events").select("*, recurrence_rule(*)");

      if (parsedInput.search?.length) {
        query = query.ilike("title", `%${parsedInput.search}%`);
      }

      const { data, error } = await query.overrideTypes<WMCCEvent[]>();

      return {
        error: error?.message ?? null,
        data,
      };
    } catch (error) {
      console.error(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
      };
    }
  });
