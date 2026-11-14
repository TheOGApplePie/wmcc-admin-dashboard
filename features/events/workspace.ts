import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireViewerPermission } from "@/features/access/server";
import { createClient } from "@/utils/supabase/server";
import { readEventDetail } from "./server";

export const readEventWorkspace = cache(async (eventId: string) => {
  await requireViewerPermission("events", "view");
  const id = Number(eventId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const detail = await readEventDetail(await createClient(), id);
  if (!detail.event) notFound();
  return { ...detail, event: detail.event };
});
