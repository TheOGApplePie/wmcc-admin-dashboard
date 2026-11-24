"use server";

import { createSafeActionClient } from "next-safe-action";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/utils/permissions";
import {
  saveEventSchema,
  saveScheduleSchema,
  versionedEventSchema as versioned,
  scheduleExceptionSchema,
  eventRangeSchema,
} from "@/features/events/schemas";

import { readScheduleDates, readEventSchedule } from "@/features/events/server";
import { ok, fail } from "@/utils/actionResponse";
import { scheduleDateIndex, validateSchedule } from "@/features/events/domain";
import { calendarInputs } from "@/features/events/lib/calendarInputs";
const client = createSafeActionClient();
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
async function mutate(
  operation: string,
  payload: object,
  requestId: string,
  permission = "edit",
) {
  const { supabase } = await requirePermission("events", permission);
  const { data, error } = await supabase.rpc("mutate_event", {
    p_operation: operation,
    p_payload: payload,
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
  return data as { id: number; schedule_id: string | null };
}
export const saveBaseEvent = client
  .inputSchema(saveEventSchema)
  .action(async ({ parsedInput: input }) => {
    try {
      return ok(
        await mutate(
          "save_event",
          { event_id: input.id, version: input.version, fields: input.fields },
          input.request_id,
        ),
        "Event saved.",
      );
    } catch (error) {
      return fail(message(error));
    }
  });
export const saveEventSchedule = client
  .inputSchema(saveScheduleSchema)
  .action(async ({ parsedInput: input }) => {
    try {
      validateSchedule(input.fields);
      const { request_id, ...payload } = input;
      if (input.split_from && input.id) {
        const schedule = await currentSchedule(input.event_id, input.id);
        if (schedule && schedule.version === input.version)
          scheduleDateIndex(schedule, input.split_from);
      }
      return ok(
        await mutate("save_schedule", payload, request_id),
        "Schedule saved.",
      );
    } catch (error) {
      return fail(message(error));
    }
  });
export const changeEventStatus = client
  .inputSchema(
    versioned.extend({ status: z.enum(["draft", "published", "archived"]) }),
  )
  .action(async ({ parsedInput }) => {
    try {
      return ok(
        await mutate("status", parsedInput, parsedInput.request_id, "publish"),
      );
    } catch (error) {
      return fail(message(error));
    }
  });
export const removeBaseEvent = client
  .inputSchema(versioned)
  .action(async ({ parsedInput }) => {
    try {
      return ok(
        await mutate("delete", parsedInput, parsedInput.request_id, "delete"),
      );
    } catch (error) {
      return fail(message(error));
    }
  });
export const removeEventSchedule = client
  .inputSchema(
    versioned.extend({ id: z.uuid(), restore_original: z.boolean() }),
  )
  .action(async ({ parsedInput }) => {
    try {
      return ok(
        await mutate("remove_schedule", parsedInput, parsedInput.request_id),
      );
    } catch (error) {
      return fail(message(error));
    }
  });
export const changeScheduleException = client
  .inputSchema(scheduleExceptionSchema)
  .action(async ({ parsedInput }) => {
    try {
      const schedule = await currentSchedule(
        parsedInput.event_id,
        parsedInput.id,
      );
      if (
        schedule?.version === parsedInput.version &&
        parsedInput.action !== "restore"
      ) {
        scheduleDateIndex(schedule, parsedInput.original_date);
      }
      return ok(await mutate("exception", parsedInput, parsedInput.request_id));
    } catch (error) {
      return fail(message(error));
    }
  });
export const fetchAllEvents = client
  .inputSchema(eventRangeSchema)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("events", "view");
      return calendarInputs(
        await readScheduleDates(
          supabase,
          parsedInput.rangeStart.toISOString(),
          parsedInput.rangeEnd.toISOString(),
        ),
      );
    } catch (error) {
      return { error: message(error), data: null };
    }
  });

async function currentSchedule(eventId: number, id: string) {
  const { supabase } = await requirePermission("events", "edit");
  return readEventSchedule(supabase, eventId, id);
}

/** Validate a selected recurring date and calculate split defaults on the server. */
export const inspectScheduleDate = client
  .inputSchema(
    z.object({
      event_id: z.number().int().positive(),
      id: z.uuid(),
      version: z.number().int().positive(),
      date: z.iso.date(),
    }),
  )
  .action(async ({ parsedInput }) => {
    try {
      const schedule = await currentSchedule(
        parsedInput.event_id,
        parsedInput.id,
      );
      if (!schedule || schedule.version !== parsedInput.version)
        return fail("This schedule changed. Reload before editing.");
      const index = scheduleDateIndex(schedule, parsedInput.date);
      return ok({
        remainingCount: schedule.recurrence_rule?.count
          ? schedule.recurrence_rule.count - index
          : null,
      });
    } catch (error) {
      return fail(message(error));
    }
  });
