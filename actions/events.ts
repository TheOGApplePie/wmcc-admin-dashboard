"use server";
import {
  FCRRuleInput,
  RecurrenceRule,
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
import { EVENT_TIME_ZONE, torontoDate } from "@/app/utils/date";
import { RRule, type Weekday } from "rrule";
import { Temporal } from "temporal-polyfill";

const actionClient = createSafeActionClient();

function throwOnSupabaseError(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

export const createEvent = actionClient
  .inputSchema(CreateEventZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      if (
        parsedInput.is_recurring &&
        parsedInput.recurrence_rule &&
        countIncludedOccurrences(parsedInput.start_date, {
          ...parsedInput.recurrence_rule,
          exdates: [],
        }) === 0
      ) {
        throw new Error(
          "The recurrence settings must include the event's start date.",
        );
      }
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
          .select("id")
          .single();
        if (ruleResult.error)
          throw new Error(
            "ERROR SETTING UP RECURRENCE " + ruleResult.error.message,
          );
        recurringRuleID = ruleResult.data.id;
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
          gallery_url: parsedInput.gallery_url,
          is_recurring: parsedInput.is_recurring,
          recurrence_rule_id: recurringRuleID,
          navigation_slug: parsedInput.navigation_slug,
        })
        .select("id")
        .single();

      if (error && recurringRuleID) {
        await bestEffortDelete(
          supabase,
          "recurrence_rule",
          recurringRuleID,
          "orphaned create recurrence rule",
        );
      }

      if (error) throw new Error(error.message);

      if (data)
        await logAudit(supabase, "event", data.id, "create", parsedInput.title);

      return {
        error: "",
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
      const storedEvent = await getStoredEventState(
        supabase,
        parsedInput.id,
        parsedInput.recurrence_rule_id,
      );
      const storedSeries = storedEvent.ruleId
        ? {
            startDate: storedEvent.startDate,
            ruleId: storedEvent.ruleId,
            rule: storedEvent.rule!,
          }
        : null;
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
        gallery_url: parsedInput.gallery_url,
        navigation_slug: parsedInput.navigation_slug,
      };

      // Recurring → non-recurring: detach this event, then remove its rule.
      if (!parsedInput.is_recurring && parsedInput.recurrence_rule_id) {
        if (!storedSeries) throw new Error("Event series not found.");
        const eventUpdateResult = await supabase
          .from("events")
          .update({
            ...commonFields,
            start_date: parsedInput.start_date,
            end_date: parsedInput.end_date,
            is_recurring: false,
            recurrence_rule_id: null,
          })
          .eq("id", parsedInput.id)
          .eq("is_recurring", true)
          .eq("recurrence_rule_id", storedSeries.ruleId)
          .select("id")
          .single();
        throwOnSupabaseError(eventUpdateResult);
        await bestEffortDelete(
          supabase,
          "recurrence_rule",
          storedSeries.ruleId,
          "detached recurrence rule after converting an event to non-recurring",
        );
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
        if (!storedSeries) throw new Error("Event series not found.");
        const submittedRule = parsedInput.recurrence_rule!;
        if (
          countIncludedOccurrences(parsedInput.start_date, {
            ...submittedRule,
            exdates: storedSeries.rule.exdates,
          }) === 0
        ) {
          throw new Error(
            "The recurrence settings must include the event's start date.",
          );
        }

        const ruleUpdateResult = await supabase
          .from("recurrence_rule")
          .update({
            frequency: submittedRule.frequency,
            interval: submittedRule.interval,
            by_weekdays: submittedRule.by_weekdays,
            by_month_day: submittedRule.by_month_day,
            by_set_position: submittedRule.by_set_position,
            until: submittedRule.until,
            count: submittedRule.count,
          })
          .eq("id", storedSeries.ruleId)
          .select("id")
          .single();
        throwOnSupabaseError(ruleUpdateResult);

        const eventUpdateResult = await supabase
          .from("events")
          .update({
            ...commonFields,
            start_date: parsedInput.start_date,
            end_date: parsedInput.end_date,
          })
          .eq("id", parsedInput.id)
          .eq("is_recurring", true)
          .eq("recurrence_rule_id", storedSeries.ruleId)
          .select("id")
          .single();
        if (eventUpdateResult.error) {
          await bestEffortRestoreRule(
            supabase,
            storedSeries.ruleId,
            storedSeries.rule,
            "Edit All event update",
          );
          throw new Error(eventUpdateResult.error.message);
        }
      } else if (action === "future") {
        const occDate = parsedInput.occurrence_date!;
        if (!storedSeries) throw new Error("Event series not found.");
        const originalRule = storedSeries.rule;
        const split = getOccurrenceSplit(
          storedSeries.startDate,
          originalRule,
          occDate,
        );
        const submittedRule = parsedInput.recurrence_rule!;
        if (!split.previousDate) {
          // With no visible earlier occurrence, mutate the existing row in
          // place. A proposed one-occurrence rule becomes a standalone event.
          const includedOccurrences = countIncludedOccurrences(
            parsedInput.start_date,
            {
              ...submittedRule,
              exdates: originalRule.exdates,
            },
          );
          if (includedOccurrences === 0) {
            throw new Error(
              "The updated recurrence must include the selected occurrence.",
            );
          }
          const becomesStandalone = includedOccurrences === 1;
          if (becomesStandalone) {
            const eventUpdate = await supabase
              .from("events")
              .update({
                ...commonFields,
                start_date: parsedInput.start_date,
                end_date: parsedInput.end_date,
                is_recurring: false,
                recurrence_rule_id: null,
              })
              .eq("id", parsedInput.id)
              .eq("is_recurring", true)
              .eq("recurrence_rule_id", storedSeries.ruleId)
              .select("id")
              .single();
            throwOnSupabaseError(eventUpdate);
            await bestEffortDelete(
              supabase,
              "recurrence_rule",
              storedSeries.ruleId,
              "detached recurrence rule after a future edit became standalone",
            );
          } else {
            const ruleUpdate = await supabase
              .from("recurrence_rule")
              .update({
                frequency: submittedRule.frequency,
                interval: submittedRule.interval,
                by_weekdays: submittedRule.by_weekdays,
                by_month_day: submittedRule.by_month_day,
                by_set_position: submittedRule.by_set_position,
                until: submittedRule.until,
                count: submittedRule.count,
              })
              .eq("id", storedSeries.ruleId)
              .select("id")
              .single();
            throwOnSupabaseError(ruleUpdate);

            const eventUpdate = await supabase
              .from("events")
              .update({
                ...commonFields,
                start_date: parsedInput.start_date,
                end_date: parsedInput.end_date,
                is_recurring: true,
                recurrence_rule_id: storedSeries.ruleId,
              })
              .eq("id", parsedInput.id)
              .eq("is_recurring", true)
              .eq("recurrence_rule_id", storedSeries.ruleId)
              .select("id")
              .single();
            if (eventUpdate.error) {
              await bestEffortRestoreRule(
                supabase,
                storedSeries.ruleId,
                storedSeries.rule,
                "first-occurrence future event update",
              );
              throw new Error(eventUpdate.error.message);
            }
          }
        } else {
          const futureUsesCount = submittedRule.count !== null;
          const futureCount = futureUsesCount
            ? originalRule.count
              ? submittedRule.count! - split.position + 1
              : submittedRule.count
            : null;
          if (futureCount !== null && futureCount < 1) {
            throw new Error(
              "The occurrence count must include the selected occurrence.",
            );
          }

          const futureUntil = futureUsesCount ? null : submittedRule.until;
          const splitDay = torontoDate(occDate);
          const futureExdates = (originalRule.exdates ?? []).filter(
            (date) => dateOnly(date) >= splitDay,
          );
          const includedFutureOccurrences = countIncludedOccurrences(
            parsedInput.start_date,
            {
              ...submittedRule,
              count: futureCount,
              until: futureUntil,
              exdates: futureExdates,
            },
          );
          if (includedFutureOccurrences === 0) {
            throw new Error(
              "The updated recurrence must include the selected occurrence.",
            );
          }

          const futureIsStandalone = includedFutureOccurrences === 1;
          let newRuleId: number | null = null;
          if (!futureIsStandalone) {
            const newRuleResult = await supabase
              .from("recurrence_rule")
              .insert({
                frequency: submittedRule.frequency,
                interval: submittedRule.interval,
                by_weekdays: submittedRule.by_weekdays,
                by_month_day: submittedRule.by_month_day,
                by_set_position: submittedRule.by_set_position,
                until: futureUntil,
                count: futureCount,
                exdates: futureExdates,
              })
              .select("id")
              .single();
            if (newRuleResult.error) {
              throw new Error(
                "ERROR CREATING NEW RULE " + newRuleResult.error.message,
              );
            }
            newRuleId = newRuleResult.data.id;
          }

          const futureEventResult = await supabase
            .from("events")
            .insert({
              ...commonFields,
              start_date: parsedInput.start_date,
              end_date: parsedInput.end_date,
              is_recurring: !futureIsStandalone,
              recurrence_rule_id: newRuleId,
            })
            .select("id")
            .single();
          if (futureEventResult.error) {
            if (newRuleId) {
              await bestEffortDelete(
                supabase,
                "recurrence_rule",
                newRuleId,
                "future-split recurrence rule",
              );
            }
            throw new Error(futureEventResult.error.message);
          }

          // Destructive change comes last. If it fails, compensate by removing
          // the newly-created future branch and leave the original untouched.
          const priorExdates = (originalRule.exdates ?? []).filter(
            (date) => dateOnly(date) < splitDay,
          );
          const oldRuleChanges = originalRule.count
            ? { count: split.position - 1, until: null, exdates: priorExdates }
            : { until: split.previousDate, count: null, exdates: priorExdates };
          const oldRuleUpdateResult = await supabase
            .from("recurrence_rule")
            .update(oldRuleChanges)
            .eq("id", storedSeries.ruleId)
            .select("id")
            .single();
          if (oldRuleUpdateResult.error) {
            await bestEffortDelete(
              supabase,
              "events",
              futureEventResult.data.id,
              "future-split event",
            );
            if (newRuleId) {
              await bestEffortDelete(
                supabase,
                "recurrence_rule",
                newRuleId,
                "future-split recurrence rule",
              );
            }
            throw new Error(oldRuleUpdateResult.error.message);
          }
        }
      } else if (action === "single" && parsedInput.recurrence_rule_id) {
        // Edit a single occurrence of an existing recurring series
        if (!storedSeries) throw new Error("Event series not found.");
        getOccurrenceSplit(
          storedSeries.startDate,
          storedSeries.rule,
          parsedInput.occurrence_date!,
        );
        const exdateStr = torontoDate(parsedInput.occurrence_date!);
        const currentExdates = storedSeries.rule.exdates ?? [];

        const replacementEventResult = await supabase
          .from("events")
          .insert({
            ...commonFields,
            start_date: parsedInput.start_date,
            end_date: parsedInput.end_date,
            is_recurring: false,
            recurrence_rule_id: null,
          })
          .select("id")
          .single();
        throwOnSupabaseError(replacementEventResult);

        const exclusionUpdateResult = await supabase
          .from("recurrence_rule")
          .update({ exdates: [...new Set([...currentExdates, exdateStr])] })
          .eq("id", storedSeries.ruleId)
          .select("id")
          .single();
        if (exclusionUpdateResult.error) {
          await bestEffortDelete(
            supabase,
            "events",
            replacementEventResult.data!.id,
            "single-occurrence replacement",
          );
          throw new Error(exclusionUpdateResult.error.message);
        }
      } else {
        // Handles: plain non-recurring edit, and non-recurring → recurring conversion
        let newRecurrenceRuleId: number | undefined = undefined;
        if (
          parsedInput.is_recurring &&
          parsedInput.recurrence_rule &&
          !parsedInput.recurrence_rule_id
        ) {
          if (
            countIncludedOccurrences(parsedInput.start_date, {
              ...parsedInput.recurrence_rule,
              exdates: [],
            }) === 0
          ) {
            throw new Error(
              "The recurrence settings must include the event's start date.",
            );
          }
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
            .select("id")
            .single();
          if (ruleResult.error) throw new Error(ruleResult.error.message);
          newRecurrenceRuleId = ruleResult.data.id;
        }
        const eventUpdateResult = await supabase
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
          .eq("id", parsedInput.id)
          .eq("is_recurring", false)
          .is("recurrence_rule_id", null)
          .select("id")
          .single();
        if (eventUpdateResult.error) {
          if (newRecurrenceRuleId) {
            await bestEffortDelete(
              supabase,
              "recurrence_rule",
              newRecurrenceRuleId,
              "orphaned conversion recurrence rule",
            );
          }
          throw new Error(eventUpdateResult.error.message);
        }
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
      const storedEvent = await getStoredEventState(
        supabase,
        parsedInput.id,
        parsedInput.recurrence_rule_id,
      );
      const storedSeries = storedEvent.ruleId
        ? {
            startDate: storedEvent.startDate,
            ruleId: storedEvent.ruleId,
            rule: storedEvent.rule!,
          }
        : null;

      if (parsedInput.action === "all" && parsedInput.recurrence_rule_id) {
        if (!storedSeries) throw new Error("Event series not found.");
        const eventDeleteResult = await supabase
          .from("events")
          .delete()
          .eq("id", parsedInput.id)
          .eq("is_recurring", true)
          .eq("recurrence_rule_id", storedSeries.ruleId)
          .select("id")
          .single();
        throwOnSupabaseError(eventDeleteResult);
        await bestEffortDelete(
          supabase,
          "recurrence_rule",
          storedSeries.ruleId,
          "recurrence rule after deleting its event series",
        );
      } else if (
        parsedInput.action === "future" &&
        parsedInput.recurrence_rule_id
      ) {
        if (!storedSeries) throw new Error("Event series not found.");
        const split = getOccurrenceSplit(
          storedSeries.startDate,
          storedSeries.rule,
          parsedInput.start_date,
        );
        if (!split.previousDate) {
          const eventDeleteResult = await supabase
            .from("events")
            .delete()
            .eq("id", parsedInput.id)
            .eq("is_recurring", true)
            .eq("recurrence_rule_id", storedSeries.ruleId)
            .select("id")
            .single();
          throwOnSupabaseError(eventDeleteResult);
          await bestEffortDelete(
            supabase,
            "recurrence_rule",
            storedSeries.ruleId,
            "recurrence rule after deleting this and future occurrences",
          );
        } else {
          const splitDay = torontoDate(parsedInput.start_date);
          const priorExdates = (storedSeries.rule.exdates ?? []).filter(
            (date) => dateOnly(date) < splitDay,
          );
          const ruleChanges = storedSeries.rule.count
            ? { count: split.position - 1, until: null, exdates: priorExdates }
            : { until: split.previousDate, count: null, exdates: priorExdates };
          const ruleUpdateResult = await supabase
            .from("recurrence_rule")
            .update(ruleChanges)
            .eq("id", storedSeries.ruleId)
            .select("id")
            .single();
          throwOnSupabaseError(ruleUpdateResult);
        }
      } else if (
        parsedInput.action === "this" &&
        parsedInput.recurrence_rule_id
      ) {
        if (!storedSeries) throw new Error("Event series not found.");
        getOccurrenceSplit(
          storedSeries.startDate,
          storedSeries.rule,
          parsedInput.start_date,
        );
        const exdateStr = torontoDate(parsedInput.start_date);
        const currentExdates = storedSeries.rule.exdates ?? [];
        const exclusionUpdateResult = await supabase
          .from("recurrence_rule")
          .update({ exdates: [...new Set([...currentExdates, exdateStr])] })
          .eq("id", storedSeries.ruleId)
          .select("id")
          .single();
        throwOnSupabaseError(exclusionUpdateResult);
      } else {
        const eventDeleteResult = await supabase
          .from("events")
          .delete()
          .eq("id", parsedInput.id)
          .eq("is_recurring", false)
          .is("recurrence_rule_id", null)
          .select("id")
          .single();
        throwOnSupabaseError(eventDeleteResult);
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
            exdate:
              rule.exdates?.map((date: string) =>
                exclusionDateTime(date, ev.start_date),
              ) ?? [],
          };
        }) ?? [];

      return [...singleOccurrences, ...recurringOccurrences].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
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
  if (rule.until) options.until = `${dateOnly(rule.until)}T23:59:59`;
  if (rule.count) options.count = rule.count;
  return options;
};

const calcDuration = (start: string, end: string): string => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const toFloatingToronto = (isoDate: string | Date): string => {
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

const dateOnly = (value: string | Date): string =>
  (value instanceof Date ? value.toISOString() : value).slice(0, 10);

const exclusionDateTime = (date: string, seriesStart: string): string => {
  const localStart = toFloatingToronto(seriesStart);
  return `${dateOnly(date)}${localStart.slice(10)}`;
};

const FREQUENCIES: Record<string, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
};
const WEEKDAYS: Record<string, Weekday> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
};

interface StoredEventState {
  startDate: string;
  ruleId: number | null;
  rule: RecurrenceRule | null;
}

async function bestEffortDelete(
  supabase: SupabaseClient,
  table: "events" | "recurrence_rule",
  id: number,
  label: string,
): Promise<void> {
  const result = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) {
    console.error(
      `Failed to clean up ${label} ${id}:`,
      result.error ?? "No matching row was deleted.",
    );
  }
}

async function bestEffortRestoreRule(
  supabase: SupabaseClient,
  ruleId: number,
  rule: RecurrenceRule,
  failedOperation: string,
): Promise<void> {
  const result = await supabase
    .from("recurrence_rule")
    .update({
      frequency: rule.frequency,
      interval: rule.interval,
      by_weekdays: rule.by_weekdays,
      by_month_day: rule.by_month_day,
      by_set_position: rule.by_set_position,
      until: rule.until,
      count: rule.count,
    })
    .eq("id", ruleId)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) {
    console.error(
      `Failed to restore recurrence rule ${ruleId} after ${failedOperation}:`,
      result.error ?? "No matching recurrence rule was updated.",
    );
  }
}

async function getStoredEventState(
  supabase: SupabaseClient,
  eventId: number,
  expectedRuleId?: number,
): Promise<StoredEventState> {
  const result = await supabase
    .from("events")
    .select(
      `start_date, is_recurring, recurrence_rule_id, recurrence_rule (
        id, frequency, interval, by_weekdays, by_month_day,
        by_set_position, until, count, exdates
      )`,
    )
    .eq("id", eventId)
    .maybeSingle();
  throwOnSupabaseError(result);
  if (!result.data) {
    throw new Error("The event no longer exists. Reload and try again.");
  }

  const relation = Array.isArray(result.data.recurrence_rule)
    ? result.data.recurrence_rule[0]
    : result.data.recurrence_rule;

  if (expectedRuleId === undefined) {
    if (
      result.data.is_recurring ||
      result.data.recurrence_rule_id !== null ||
      relation
    ) {
      throw new Error(
        "The event's recurrence state has changed. Reload and try again.",
      );
    }
    return {
      startDate: result.data.start_date,
      ruleId: null,
      rule: null,
    };
  }

  if (
    !result.data.is_recurring ||
    !relation ||
    result.data.recurrence_rule_id !== expectedRuleId ||
    relation.id !== expectedRuleId
  ) {
    throw new Error(
      "The event and recurrence rule no longer match. Reload and try again.",
    );
  }

  return {
    startDate: result.data.start_date,
    ruleId: result.data.recurrence_rule_id,
    rule: relation,
  };
}

type OccurrenceRule = Omit<RecurrenceRule, "until"> & {
  until?: string | Date | null;
};

function buildOccurrenceRRule(
  seriesStart: string | Date,
  rule: OccurrenceRule,
): { recurrence: RRule; dtstart: Date } {
  const hasCount = rule.count !== null && rule.count !== undefined;
  const hasUntil = rule.until !== null && rule.until !== undefined;
  if (hasCount === hasUntil) {
    throw new Error(
      "The recurrence rule must use either a count or an end date, but not both.",
    );
  }

  const frequency = FREQUENCIES[rule.frequency.toLowerCase()];
  if (frequency === undefined) {
    throw new Error("The stored recurrence frequency is invalid.");
  }

  const dtstart = new Date(`${toFloatingToronto(seriesStart)}Z`);
  const options: ConstructorParameters<typeof RRule>[0] = {
    freq: frequency,
    dtstart,
  };
  if (rule.interval) options.interval = rule.interval;
  if (hasCount) options.count = rule.count!;
  if (rule.by_month_day) options.bymonthday = rule.by_month_day;
  if (rule.by_set_position?.length) options.bysetpos = rule.by_set_position;
  if (rule.by_weekdays?.length) {
    options.byweekday = rule.by_weekdays.map((value) => {
      const match = /^(-?\d+)?([A-Z]{2})$/.exec(value.toUpperCase());
      const weekday = match ? WEEKDAYS[match[2]] : undefined;
      if (!match || !weekday) {
        throw new Error("The stored recurrence weekday is invalid.");
      }
      return match[1] ? weekday.nth(Number(match[1])) : weekday;
    });
  }
  if (hasUntil) {
    options.until = new Date(`${dateOnly(rule.until!)}T23:59:59.999Z`);
  }

  return { recurrence: new RRule(options), dtstart };
}

function countIncludedOccurrences(
  seriesStart: string | Date,
  rule: OccurrenceRule,
): 0 | 1 | 2 {
  const { recurrence, dtstart } = buildOccurrenceRRule(seriesStart, rule);
  const excludedDays = new Set((rule.exdates ?? []).map(dateOnly));
  let occurrence = recurrence.after(dtstart, true);

  if (
    !occurrence ||
    occurrence.getTime() !== dtstart.getTime() ||
    excludedDays.has(occurrence.toISOString().slice(0, 10))
  ) {
    return 0;
  }

  while ((occurrence = recurrence.after(occurrence, false))) {
    if (!excludedDays.has(occurrence.toISOString().slice(0, 10))) {
      return 2;
    }
  }
  return 1;
}

function floatingTorontoToUtc(floatingDate: Date): number {
  const plainDateTime = Temporal.PlainDateTime.from(
    floatingDate.toISOString().replace(/Z$/, ""),
  );
  return plainDateTime.toZonedDateTime(EVENT_TIME_ZONE).epochMilliseconds;
}

function getOccurrenceSplit(
  seriesStart: string,
  rule: RecurrenceRule,
  occurrence: Date,
): {
  position: number;
  previousDate: string | null;
} {
  const { recurrence, dtstart } = buildOccurrenceRRule(seriesStart, rule);
  const target = new Date(`${toFloatingToronto(occurrence.toISOString())}Z`);
  const occurrences = recurrence.between(dtstart, target, true);
  const position = occurrences.length;
  const selectedOccurrence = occurrences[position - 1];
  const selectedDay = selectedOccurrence?.toISOString().slice(0, 10);
  const excludedDays = new Set((rule.exdates ?? []).map(dateOnly));
  if (
    !selectedOccurrence ||
    floatingTorontoToUtc(selectedOccurrence) !== occurrence.getTime() ||
    !selectedDay ||
    excludedDays.has(selectedDay)
  ) {
    throw new Error(
      "The selected occurrence is no longer part of this series. Reload and try again.",
    );
  }

  let previousOccurrence: Date | null = null;
  for (let index = position - 2; index >= 0; index--) {
    const candidate = occurrences[index];
    if (!excludedDays.has(candidate.toISOString().slice(0, 10))) {
      previousOccurrence = candidate;
      break;
    }
  }
  return {
    position,
    previousDate: previousOccurrence?.toISOString().slice(0, 10) ?? null,
  };
}
