import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { readEventWorkspace } from "@/features/events/workspace";
import { RegistrationAvailability, type Availability } from "@/features/events/components/RegistrationAvailability";
import { RegistrationDetailsPanel } from "@/features/events/components/RegistrationDetailsPanel";
import { parseRegistrationColumns, parseRegistrations, registrationCell } from "@/features/events/lib/registrants";

const PAGE_SIZE = 25;
const COLUMN_PAGE_SIZE = 10;

function validPage(value: string | undefined): number {
  const page = Number(value ?? 1);
  return Number.isSafeInteger(page) && page > 0 && page <= 1000000 ? page : 1;
}

export default async function EventRegistrantsPage({ params, searchParams }: Readonly<{
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ page?: string; columns?: string; submission?: string; snapshot?: string }>;
}>) {
  const { event } = await readEventWorkspace((await params).eventId);
  const query = await searchParams;
  const page = validPage(query.page);
  const columnPage = validPage(query.columns);
  const base = `/dashboard/events/${event.id}/registrants`;
  const snapshot = /^[a-f0-9]{32}$/.test(query.snapshot ?? "") ? query.snapshot : undefined;
  const supabase = await createClient();
  const { data: availability, error: availabilityError } = await supabase.rpc("registration_availability_status", { p_event_id: event.id }).single<Availability>();
  if (availabilityError || !availability) throw new Error("Unable to load registration availability.");
  const { data, error } = await supabase.rpc("event_registration_table", {
    p_event_id: event.id, p_page: page, p_page_size: PAGE_SIZE,
    p_column_page: columnPage, p_column_page_size: COLUMN_PAGE_SIZE, p_snapshot: snapshot ?? null,
  }).single<{ total: number; registrations: unknown; column_total: number; columns: unknown; snapshot: string }>();
  if (error?.code === "40001") return <section className="space-y-3" role="alert">
    <h2 className="text-lg font-semibold">Registrations changed</h2>
    <p>New or updated submissions changed this table. Refresh to see the current data.</p>
    <Link href={base} className="font-semibold text-teal">Refresh registrations</Link>
  </section>;
  if (error) throw new Error(error.message);
  const rows = parseRegistrations(data?.registrations ?? []);
  const columns = parseRegistrationColumns(data?.columns ?? []);
  const total = data?.total ?? 0;
  const columnTotal = data?.column_total ?? 0;
  const offset = (page - 1) * PAGE_SIZE;
  const columnOffset = (columnPage - 1) * COLUMN_PAGE_SIZE;
  const requestedSubmission = Number(query.submission);
  const selectedIndex = Number.isSafeInteger(requestedSubmission) ? requestedSubmission - offset - 1 : -1;
  const selected = selectedIndex >= 0 && selectedIndex < rows.length ? rows[selectedIndex] : null;
  const href = (targetPage: number, targetColumns = columnPage, submission?: number) => {
    const search = new URLSearchParams({ page: String(targetPage), columns: String(targetColumns), snapshot: data?.snapshot ?? "" });
    if (submission !== undefined) search.set("submission", String(submission));
    return `${base}?${search.toString()}`;
  };

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="registrants-heading">
      <h2 id="registrants-heading" className="text-lg font-semibold">Registrants</h2>
      <RegistrationAvailability eventId={event.id} availability={availability} />
      <p className="text-sm text-muted">Registrations for the entire event, including all recurring sessions. Select a registration to view its complete submitted fields.</p>
      <p className="text-sm">{total} {total === 1 ? "registration" : "registrations"}{rows.length > 0 && ` · Showing ${offset + 1}–${offset + rows.length}`}</p>
      {!rows.length ? (
        <p className="rounded-xl border border-line p-5 text-sm text-muted">{total === 0 ? "No registrations yet." : "No registrations on this page."}</p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Registrations for {event.title}</caption>
                <thead className="bg-canvas"><tr><th scope="col" className="p-3">Registration</th>{columns.map((column) => <th scope="col" key={column} className="min-w-36 break-words p-3">{column || "(Blank field name)"}</th>)}</tr></thead>
                <tbody>{rows.map((row, index) => {
                  const number = offset + index + 1;
                  return <tr key={number} className="border-t border-line">
                    <th scope="row" className="p-3"><Link href={`${href(page, columnPage, number)}#submission-details`} prefetch={false} aria-current={selected !== null && index === selectedIndex ? "true" : undefined} className="font-semibold text-teal">{number}<span className="sr-only">: view details</span></Link></th>
                    {columns.map((column) => <td key={column} className="max-w-64 break-words p-3">{registrationCell(row, column)}</td>)}
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {columnTotal > COLUMN_PAGE_SIZE && <nav aria-label="Registration field pages" className="flex flex-wrap items-center gap-4 text-sm">
              {columnPage > 1 && <Link href={href(page, columnPage - 1)} className="font-semibold text-teal">Previous fields</Link>}
              <span>Fields {columnOffset + 1}–{Math.min(columnOffset + columns.length, columnTotal)} of {columnTotal}</span>
              {columnOffset + columns.length < columnTotal && <Link href={href(page, columnPage + 1)} className="font-semibold text-teal">Next fields</Link>}
            </nav>}
            {columnPage > 1 && !columns.length && <Link href={href(page, 1)} className="text-sm font-semibold text-teal">Back to first fields</Link>}
          </div>
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
