"use server";
import { EVENT_FIELD_LIMITS } from "@/features/events/constants";
import { MAX_EVENT_POSTER_BYTES } from "@/features/events/constants";

import { createSafeActionClient } from "next-safe-action";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/utils/permissions";
import {
  saveEventSchema,
  saveScheduleSchema,
  versionedEventSchema as versioned,
  occurrenceChangeSchema,
  eventRangeSchema,
} from "@/features/events/schemas";
import { generateOccurrences } from "@/features/events/domain";
import { readOccurrences } from "@/features/events/server";
import { ok, fail } from "@/utils/actionResponse";
import { resolveStorageUrl } from "@/utils/uploadFiles";
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
      return ok(
        await mutate(
          "save_schedule",
          { ...payload, occurrences: generateOccurrences(input.fields) },
          request_id,
        ),
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
export const changeScheduleState = client
  .inputSchema(versioned.extend({ id: z.uuid(), cancelled: z.boolean() }))
  .action(async ({ parsedInput }) => {
    try {
      return ok(
        await mutate("schedule_state", parsedInput, parsedInput.request_id),
      );
    } catch (error) {
      return fail(message(error));
    }
  });
export const changeOccurrence = client
  .inputSchema(occurrenceChangeSchema)
  .action(async ({ parsedInput }) => {
    try {
      return ok(
        await mutate("occurrence", parsedInput, parsedInput.request_id),
      );
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
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("events", "view");
      const rows = await readOccurrences(
        supabase,
        parsedInput.rangeStart.toISOString(),
        parsedInput.rangeEnd.toISOString(),
      );
      return rows.map((row) => ({
        ...row,
        id: row.id,
        occurrence_id: row.id,
        start: row.start_at,
        end: row.end_at,
        start_date: row.start_at,
        end_date: row.end_at,
        classNames: row.publication_status === "draft" ? ["opacity-60"] : [],
      }));
    } catch (error) {
      return { error: message(error), data: null };
    }
  });
