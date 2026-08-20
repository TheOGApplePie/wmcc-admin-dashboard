import { fetchAllEvents } from "@/actions/events";
import { type EventInput } from "@fullcalendar/react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface CalendarRange {
  start: Date;
  end: Date;
}

export function useCalendarEvents() {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The first FullCalendar datesSet callback establishes the fetch range.
  // Start covered so the empty calendar never flashes before that request.
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const beginRequest = useCallback(() => {
    setIsLoading(true);
    setError(null);
  }, []);

  const changeRange = useCallback(
    (nextRange: CalendarRange) => {
      beginRequest();
      setRange(nextRange);
    },
    [beginRequest],
  );

  const reload = useCallback(() => {
    beginRequest();
    setReloadKey((key) => key + 1);
  }, [beginRequest]);

  useEffect(() => {
    if (!range) return;

    const requestId = ++requestIdRef.current;

    void fetchAllEvents({ rangeStart: range.start, rangeEnd: range.end })
      .then((result) => {
        if (requestId !== requestIdRef.current) return;

        if (result.serverError) {
          setError(result.serverError);
        } else if (!Array.isArray(result.data)) {
          setError(result.data?.error || "Events could not be loaded.");
        } else {
          setEvents(result.data);
        }
        setIsLoading(false);
      })
      .catch((fetchError) => {
        if (requestId !== requestIdRef.current) return;
        console.error(fetchError);
        setError(
          "Events could not be loaded. Check your connection and try again.",
        );
        setIsLoading(false);
      });
  }, [range, reloadKey]);

  return { events, error, isLoading, changeRange, reload };
}
