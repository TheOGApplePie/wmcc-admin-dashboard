import { PageShell } from "@/app/components/ui/PageShell";
import EventsCalendar from "@/app/components/EventsCalendar";
import { requirePermission } from "@/features/access/server";

export default async function Events() {
  await requirePermission("events", "view");
  return (
    <PageShell title="Events" subtitle="Manage and schedule community events">
      <EventsCalendar />
    </PageShell>
  );
}
