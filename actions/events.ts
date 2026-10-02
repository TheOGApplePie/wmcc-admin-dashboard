"use server";
import {
  EVENT_FIELD_LIMITS,
  MAX_EVENT_POSTER_BYTES,
} from "@/features/events/constants";

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

import {
  readCalendarSchedules,
  readEventDetail,
} from "@/features/events/server";
import { ok, fail } from "@/utils/actionResponse";
import { resolveStorageUrl } from "@/utils/uploadFiles";
import { scheduleDateIndex } from "@/features/events/domain";
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
      const { request_id, ...payload } = input;
      if (input.split_from && input.id) {
        const schedule = await currentSchedule(
          input.event_id,
          input.id,
        );
        if (schedule && schedule.version === input.version) scheduleDateIndex(schedule, input.split_from);
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
      const schedule = await currentSchedule(parsedInput.event_id, parsedInput.id);
      if (schedule?.version === parsedInput.version && parsedInput.action !== "restore") {
        scheduleDateIndex(schedule, parsedInput.original_date);
      }
      return ok(await mutate("exception", parsedInput, parsedInput.request_id));
    } catch (error) {
      return fail(message(error));
    }
  });
export const uploadEventPoster = client
  .inputSchema(
    z.object({
      file: z
        .file()
        .max(MAX_EVENT_POSTER_BYTES)
        .mime(["image/jpeg", "image/png"]),
      title: z.string().min(1).max(EVENT_FIELD_LIMITS.shortTextMax),
    }),
  )
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("events", "edit");
      return ok(
        await resolveStorageUrl(
          supabase,
          parsedInput.file,
          null,
          parsedInput.title,
        ),
      );
    } catch (error) {
      return fail(message(error));
    }
  });
export const fetchAllEvents = client
  .inputSchema(eventRangeSchema)
  .action(async () => {
    try {
      const { supabase } = await requirePermission("events", "view");
      return await readCalendarSchedules(supabase);
    } catch (error) {
      return { error: message(error), data: null };
    }
  });

async function currentSchedule(eventId: number, id: string) {
  const { supabase } = await requirePermission("events", "edit");
  const detail = await readEventDetail(supabase, eventId);
  const schedule = detail.schedules.find((row) => row.id === id);
  return schedule;
}
