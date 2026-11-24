import "server-only";
import { z } from "zod";
import { librarySorts, type LibraryFilters } from "./filters";

export const libraryCursorSchema = z.object({
  v: z.literal(1), sort: z.enum(librarySorts), q: z.string(), status: z.string(),
  referenceAt: z.iso.datetime(), snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  last: z.object({ at: z.iso.datetime({ offset: true }).nullable(), id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
});
export type LibraryCursor = z.infer<typeof libraryCursorSchema>;


export class LibraryCursorError extends Error {}
export function encodeLibraryCursor(cursor: LibraryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeLibraryCursor(token: string, filters: LibraryFilters, now: number): LibraryCursor {
  let cursor: LibraryCursor;
  try { cursor = libraryCursorSchema.parse(JSON.parse(Buffer.from(token, "base64url").toString("utf8"))); }
  catch { throw new LibraryCursorError("Invalid event-library cursor."); }
  if (cursor.sort !== filters.sort || cursor.q !== filters.q || cursor.status !== filters.status)
    throw new LibraryCursorError("This cursor belongs to different event-library filters or sorting.");
  const age = now - Date.parse(cursor.referenceAt);
  if (age < 0 || age > 60 * 60 * 1000) throw new LibraryCursorError("The event list expired. Start from the first page.");
  return cursor;
}
