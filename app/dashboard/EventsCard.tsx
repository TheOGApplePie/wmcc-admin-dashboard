import Link from "next/link";
import { Card, CardHead } from "@/app/components/ui/Card";
import { type Occurrence } from "@/utils/expandEvents";
import { AlsoThisWeekRow } from "./AlsoThisWeekRow";
import { EventHeroCard } from "./EventHeroCard";
import { ALSO_THIS_WEEK_DOT_CLASSES } from "./_lib/dashboard";

export function EventsCard({ occs }: Readonly<{ occs: Occurrence[] }>) {
  if (occs.length === 0) {
    return (
      <Card>
        <CardHead
          title="Upcoming Events"
          action={
            <Link
              href="/dashboard/events"
              className="text-xs text-teal hover:text-teal-dark transition-colors"
            >
              View calendar
            </Link>
          }
        />
        <p className="text-body-sm text-muted py-4 text-center">
          No events in the next 2 weeks.
        </p>
      </Card>
    );
  }

  const [hero, ...rest] = occs;
  const alsoThisWeek = rest.slice(0, 3);

  return (
    <Card noPad className="overflow-hidden">
      <EventHeroCard event={hero.event} occurrenceDate={hero.occurrenceDate} />

      {alsoThisWeek.length > 0 && (
        <>
          <div className="flex items-center justify-between px-5 pt-4 pb-1">
            <span className="text-caption font-semibold text-muted uppercase tracking-widest">
              More upcoming sessions
            </span>
            <Link
              href="/dashboard/events"
              className="text-xs text-teal hover:text-teal-dark transition-colors"
            >
              View calendar
            </Link>
          </div>
          <div className="flex flex-col pb-2">
            {alsoThisWeek.map(({ event, occurrenceDate }, i) => (
              <AlsoThisWeekRow
                key={`${event.id}-${occurrenceDate.toISOString()}`}
                event={event}
                occurrenceDate={occurrenceDate}
                dotClassName={
                  ALSO_THIS_WEEK_DOT_CLASSES[
                    i % ALSO_THIS_WEEK_DOT_CLASSES.length
                  ]
                }
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
