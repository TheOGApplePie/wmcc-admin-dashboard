import Link from "next/link";
import { requireViewerPermission } from "@/features/access/server";
import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";

const PAGE_SIZE = 25;
type HistoryRow = { id: number; revision: number; changed_at: string; changed_by: string | null; snapshot: Record<string, unknown> };

export default async function AnnouncementHistory({ params, searchParams }: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}>) {
  await requireViewerPermission("announcements", "view");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const requested = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 && requested <= 100000 ? requested : 1;
  const { data, error, count } = await (await createClient()).from("announcement_history")
    .select("id,revision,changed_at,changed_by,snapshot", { count: "exact" })
    .eq("announcement_id", id).order("revision", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load announcement history.");
  const rows = (data ?? []) as HistoryRow[];
  const href = (target: number) => `/dashboard/announcements/${id}/history?page=${target}`;
  return <main className="mx-auto max-w-4xl space-y-5 p-5">
    <Link href="/dashboard/announcements" className="text-sm font-semibold text-teal">Back to announcements</Link>
    <h1 className="text-xl font-semibold">Announcement history</h1>
    <p className="text-sm text-muted">Previous content and approval states are retained when an announcement changes.</p>
    {!rows.length ? <p>No recorded changes on this page.</p> : <ol className="space-y-3">{rows.map((row) => <li key={row.id} className="rounded-xl border border-line p-4">
      <details><summary className="cursor-pointer font-semibold">Revision {row.revision} · {new Date(row.changed_at).toLocaleString("en-CA", { timeZone: "America/Toronto", timeZoneName: "short" })}</summary>
        <p className="mt-2 text-sm text-muted">Changed by: {row.changed_by ?? "Unknown"}</p>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-canvas p-3 text-xs">{JSON.stringify(row.snapshot, null, 2)}</pre>
      </details>
    </li>)}</ol>}
    <nav aria-label="History pages" className="flex gap-4 text-sm">
      {page > 1 && <Link href={href(page - 1)}>Previous</Link>}<span>Page {page}</span>
      {page * PAGE_SIZE < (count ?? 0) && <Link href={href(page + 1)}>Next</Link>}
    </nav>
  </main>;
}
