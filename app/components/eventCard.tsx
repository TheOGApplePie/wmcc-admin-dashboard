import Image from "next/image";
import { Event } from "../schemas/events";

interface EventCardProps {
  event: Event;
  editEvent: () => void;
  deleteEvent: () => void;
}

function convertDatesToDateRange(
  startDate: string | Date,
  endDate: string | Date,
) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return `Start: ${start.toLocaleTimeString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h12" })} End: ${end.toLocaleTimeString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h12" })}`;
}

export default function EventCard({
  event,
  editEvent,
  deleteEvent,
}: EventCardProps) {
  return (
    <div className={`card ${event.poster_url && "card-side"} shadow-sm`}>
      {event.poster_url && (
        <figure>
          <Image
            src={event.poster_url ? event.poster_url : ""}
            alt={event.poster_alt}
            height={400}
            width={400}
          />
        </figure>
      )}
      <div className="card-body gap-3">
        <h1 className="card-title">{event.title}</h1>
        <h3>{event.description}</h3>
        <div className="card-actions flex">
          <div className="flex-1">
            <p>{convertDatesToDateRange(event.start_date, event.end_date)}</p>
          </div>
          <div className="flex-1 gap-3 flex justify-end">
            <button className="btn btn-neutral" onClick={() => editEvent()}>
              Edit
            </button>
            <button className="btn btn-error" onClick={() => deleteEvent()}>
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
