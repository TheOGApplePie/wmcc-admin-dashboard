export type EventFrequency = "daily" | "weekly" | "monthly";
export type EventWeekday = "su" | "mo" | "tu" | "we" | "th" | "fr" | "sa";
export type EditEventAction = "all" | "single" | "future" | "yes";
export type DeleteEventAction = "all" | "this" | "future" | "yes";

// Calendar display DTO. Mutation schemas live in features/events/schemas.ts.
export interface Event {
  occurrence_id?: string;
  publication_status?: "draft" | "published" | "archived";
  id: number;
  title: string;
  description: string;
  location: string;
  poster_url: string | null;
  poster_file: File | null;
  poster_alt: string;
  call_to_action_link: string | null;
  call_to_action_caption: string;
  start_date: Date | string;
  end_date: Date | string;
  action: EditEventAction | DeleteEventAction;
  gallery_url: string | null;
  navigation_slug: string;
  is_recurring: boolean;
  recurrence_rule_id?: number;
  recurrence_rule?: {
    frequency: EventFrequency;
    interval: number | null;
    by_weekdays: EventWeekday[];
    by_month_day: number | null; // e.g. 2 for "2nd of each month"
    by_set_position?: number[]; // e.g. 1 for "1st", -1 for "last"
    until: Date | string | null; // Date limit
    count: number | null; // Occurrences limit
    exdates?: string[]; // ISO date strings of excluded occurrences
  };
}
