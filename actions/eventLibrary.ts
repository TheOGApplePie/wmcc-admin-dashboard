"use server";
import { z } from "zod";
import { requirePermission } from "@/utils/permissions";
import { parseLibraryFilters } from "@/features/events/library/filters";
import { readLibraryPage } from "@/features/events/library/server";
import { LibraryCursorError } from "@/features/events/library/cursor";

const requestSchema = z.object({
  q: z.string().max(1000).optional(),
  status: z.string().max(40).optional(),
  sort: z.string().max(40).optional(),
  cursor: z.string().max(4096).optional(),
});
export async function loadEventLibrary(input: unknown) {
  try {
    const request = requestSchema.parse(input);
    const { supabase } = await requirePermission("events", "view");
    return {
      data: await readLibraryPage(
        supabase,
        parseLibraryFilters(request),
        request.cursor,
      ),
      error: null,
      resetRequired: false,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unable to load events.",
      resetRequired: error instanceof LibraryCursorError,
    };
  }
}
