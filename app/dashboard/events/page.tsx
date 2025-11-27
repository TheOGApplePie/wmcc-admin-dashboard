import { filterEvents } from "@/actions/events";
import EventsWithPagination from "@/app/components/eventsWithPagination";
import { Event } from "@/app/schemas/events";

export default async function Events() {
  const raw = await filterEvents({
    currentPage: 1,
    pageSize: 10,
    search: "",
  });

  const events = (raw.data?.data.events as Event[]) ?? [];

  return (
    <EventsWithPagination
      events={events}
      count={raw.data?.data.count ?? events.length}
    />
  );
}
