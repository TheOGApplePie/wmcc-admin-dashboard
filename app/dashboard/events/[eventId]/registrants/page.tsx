import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { readEventWorkspace } from "@/features/events/workspace";
import { RegistrationDetailsPanel } from "@/features/events/components/RegistrationDetailsPanel";
import { parseRegistrations, registrationPreview } from "@/features/events/lib/registrants";

const PAGE_SIZE = 25;

export default async function EventRegistrantsPage({ params, searchParams }: Readonly<{
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ page?: string; submission?: string }>;
}>) {
  const { event } = await readEventWorkspace((await params).eventId);
  const query = await searchParams;
  const requestedPage = Number(query.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1000000 ? requestedPage : 1;
  const { data, error } = await (await createClient()).rpc("event_registration_page", {
    p_event_id: event.id, p_page: page, p_page_size: PAGE_SIZE,
  }).single<{ total: number; registrations: unknown }>();
  if (error) throw new Error(error.message);
  const rows = parseRegistrations(data?.registrations ?? []);
  const total = data?.total ?? 0;
  const offset = (page - 1) * PAGE_SIZE;
  const requestedSubmission = Number(query.submission);
  const selectedIndex = Number.isSafeInteger(requestedSubmission) ? requestedSubmission - offset - 1 : -1;
  const selected = selectedIndex >= 0 && selectedIndex < rows.length ? rows[selectedIndex] : null;
  const href = (target: number) => `/dashboard/events/${event.id}/registrants?page=${target}`;

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="registrants-heading">
      <h2 id="registrants-heading" className="text-lg font-semibold">Registrants</h2>
      <p className="text-sm text-muted">Registrations for the entire event, including all recurring sessions. Select a registration to view its submitted fields and repeatable sections in the details panel.</p>
      <p className="text-sm">{total} {total === 1 ? "registration" : "registrations"}{rows.length > 0 && ` · Showing ${offset + 1}–${offset + rows.length}`}</p>
      {!rows.length ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">{total === 0 ? "No registrations yet." : "No registrations on this page."}</p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <ol start={offset + 1} className="min-w-0 space-y-3" aria-label={`Registrants for ${event.title}`}>
            {rows.map((row, index) => {
              const number = offset + index + 1;
              const isSelected = selected !== null && index === selectedIndex;
              return (
                <li key={number}>
                  <Link
                    href={`${href(page)}&submission=${number}#submission-details`}
                    prefetch={false}
                    aria-current={isSelected ? "true" : undefined}
                    className={`block space-y-1 rounded-xl border p-4 focus-visible:outline-2 focus-visible:outline-teal ${isSelected ? "border-teal bg-teal-soft" : "border-line bg-surface hover:border-teal"}`}
                  >
                    <span className="block font-semibold">Registration {number}</span>
                    <span className="block break-words text-sm text-muted">{registrationPreview(row) || "View submitted fields"}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <RegistrationDetailsPanel selected={selected} number={requestedSubmission} clearHref={href(page)} invalidSelection={Boolean(query.submission)} />
        </div>
      )}
      {(page > 1 || offset + rows.length < total) && <nav aria-label="Registration pages" className="flex flex-wrap items-center gap-4 text-sm">
        {page > 1 && <Link href={href(page - 1)} className="font-semibold text-teal">Previous</Link>}
        <span>Page {page}</span>
        {offset + rows.length < total && <Link href={href(page + 1)} className="font-semibold text-teal">Next</Link>}
        {!rows.length && page > 1 && <Link href={href(1)} className="font-semibold text-teal">Back to first page</Link>}
      </nav>}
    </section>
  );
}
