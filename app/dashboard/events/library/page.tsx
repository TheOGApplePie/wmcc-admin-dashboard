import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { requireViewerPermission } from "@/features/access/server";
import { PageShell } from "@/app/components/ui/PageShell";
import EventLibraryClient from "@/features/events/components/EventLibraryClient";
import { libraryHref, parseLibraryFilters } from "@/features/events/library/filters";
import { readLibraryPage } from "@/features/events/library/server";

export default async function EventLibrary({ searchParams }: Readonly<{
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}>) {
  const access = await requireViewerPermission("events", "view");
  const filters = parseLibraryFilters(await searchParams);
  const initial = await readLibraryPage(await createClient(), filters);
  return <PageShell title="All Events" subtitle="Browse posters, find upcoming sessions and manage your events" actions={access.permissions["events.edit"] ? <Link href="/dashboard/events/new" className="rounded-xl bg-teal px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2">Create event</Link> : undefined}>
    <EventLibraryClient key={libraryHref(filters)} filters={filters} initial={initial} />
  </PageShell>;
}
