import { EVENT_FIELD_LIMITS } from "@/features/events/constants";
import { EVENT_LIST_PAGE_SIZE, MAX_LIBRARY_PAGE_INDEX } from "@/features/events/constants";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { requireViewerPermission } from "@/features/access/server";
import { PageShell } from "@/app/components/ui/PageShell";
export default async function EventLibrary({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}>) {
  await requireViewerPermission("events", "view");
  const params = await searchParams;
  const page = Math.max(
    0,
    Math.min(MAX_LIBRARY_PAGE_INDEX, Math.floor(Number(params.page) || 0)),
  );
  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("id,title,publication_status", { count: "exact" })
    .order("title")
    .order("id")
    .range(page * EVENT_LIST_PAGE_SIZE, page * EVENT_LIST_PAGE_SIZE + EVENT_LIST_PAGE_SIZE - 1);
  if (params.q)
    query = query.ilike(
      "title",
      `%${params.q.replace(/[%_]/g, "").slice(0, EVENT_FIELD_LIMITS.shortTextMax)}%`,
    );
  if (["draft", "published", "archived"].includes(params.status ?? ""))
    query = query.eq("publication_status", params.status!);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const href = (next: number) =>
    `/dashboard/events/library?${new URLSearchParams({ q: params.q ?? "", status: params.status ?? "", page: String(next) })}`;
  return (
    <PageShell
      title="All events"
      subtitle="Find drafts, unscheduled events and archived events"
    >
      <div className="space-y-4">
        <Link href="/dashboard/events" className="underline">
          Back to calendar
        </Link>
        <form className="flex flex-wrap gap-3">
          <input
            aria-label="Search events"
            name="q"
            defaultValue={params.q}
            placeholder="Search events"
            className="rounded-xl border border-line p-2"
          />
          <select
            aria-label="Publication status"
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-xl border border-line p-2"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <button className="rounded-xl bg-teal px-4 py-2 text-white">
            Search
          </button>
        </form>
        {!data?.length && <p>No matching events.</p>}
        <ul className="divide-y divide-line">
          {data?.map((event) => (
            <li key={event.id} className="py-3">
              <Link
                href={`/dashboard/events/${event.id}`}
                className="font-semibold underline"
              >
                {event.title}
              </Link>
              <span className="ml-3 text-sm text-muted">
                {event.publication_status}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          {page > 0 && <Link href={href(page - 1)}>Previous</Link>}
          {(page + 1) * EVENT_LIST_PAGE_SIZE < (count ?? 0) && (
            <Link href={href(page + 1)}>Next</Link>
          )}
        </div>
      </div>
    </PageShell>
  );
}
