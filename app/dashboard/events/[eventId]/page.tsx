import { createClient } from "@/utils/supabase/server";
import { readEventWorkspace } from "@/features/events/workspace";
import { readScheduleExceptions } from "@/features/events/server";
import EventManager from "@/features/events/components/EventManager";

export default async function EventPage({ params }: Readonly<{ params: Promise<{ eventId: string }> }>) {
  const detail = await readEventWorkspace((await params).eventId);
  const exceptions = await readScheduleExceptions(await createClient(), detail.event.id);
  return <EventManager event={detail.event} schedules={detail.schedules} exceptions={exceptions} />;
}
