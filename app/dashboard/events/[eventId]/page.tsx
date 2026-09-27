import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireViewerPermission } from "@/features/access/server";
import { readEventDetail, readOccurrences } from "@/features/events/server";
import EventManager from "@/features/events/components/EventManager";
import { PageShell } from "@/app/components/ui/PageShell";
export default async function EventPage({
  params,
}: Readonly<{
  params: Promise<{ eventId: string }>;
}>) {
  await requireViewerPermission("events", "view");
  const id = Number((await params).eventId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const supabase = await createClient();
  const detail = await readEventDetail(supabase, id);
  if (!detail.event) notFound();
  const occurrences = await readOccurrences(
    supabase,
    null,
    null,
    id,
    true,
    false,
  );
  return (
    <PageShell
      title={detail.event.title}
      subtitle="Event details, schedules and sessions"
    >
      <div className="mx-auto max-w-4xl">
        <EventManager
          key={`${id}-${detail.event.version}`}
          event={detail.event}
          schedules={detail.schedules}
          campaign={detail.campaign}
          occurrences={occurrences}
        />
      </div>
    </PageShell>
  );
}
