import { PageShell } from "@/app/components/ui/PageShell";
import EventsCalendar from "@/app/components/EventsCalendar";

export default function Events() {
  return (
    <PageShell title="Events" subtitle="Manage and schedule community events">
      <EventsCalendar />
    </PageShell>
  );
}
