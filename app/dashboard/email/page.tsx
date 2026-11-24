import Link from "next/link";
import { requireViewerPermission } from "@/features/access/server";
import { createClient } from "@/utils/supabase/server";
import { createCampaign, createTemplate } from "@/features/email/actions";

const PAGE_SIZE = 25;
export default async function EmailWorkspace({ searchParams }: Readonly<{ searchParams: Promise<{ page?: string; templatesPage?: string }> }>) {
  const access = await requireViewerPermission("email", "view");
  const params = await searchParams;
  const pageValue = (value?: string) => Math.min(100000, Math.max(1, Math.floor(Number(value) || 1)));
  const page = pageValue(params.page), templatesPage = pageValue(params.templatesPage);
  const supabase = await createClient();
  const [campaigns, templates] = await Promise.all([
    supabase.from("email_campaigns").select("id,name,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("email_templates").select("id,name,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((templatesPage - 1) * PAGE_SIZE, templatesPage * PAGE_SIZE - 1),
  ]);
  if (campaigns.error || templates.error) throw new Error("Unable to load the email workspace.");
  const canEdit = Boolean(access.permissions["email.edit"]);
  return <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
    <header><h1 className="text-2xl font-bold">Email campaigns</h1><p className="mt-2 text-sm text-muted">Preliminary workspace for drafting and review. Provider connection, automation and sending are not available.</p></header>
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5"><h2 className="text-lg font-semibold">Campaigns</h2>
      {canEdit && <form action={createCampaign} className="flex flex-wrap items-end gap-2"><label className="flex-1 text-sm">Campaign name<input name="name" required maxLength={120} className="mt-1 block w-full rounded-lg border border-line p-2" /></label><button className="rounded-lg bg-teal px-4 py-2 text-white">Create campaign</button></form>}
      {!campaigns.data?.length ? <p className="text-sm text-muted">No campaigns on this page.</p> : <ul className="divide-y divide-line">{campaigns.data.map(row => <li key={row.id} className="py-3"><Link href={`/dashboard/email/${row.id}`} className="font-semibold text-teal">{row.name}</Link></li>)}</ul>}
      <nav aria-label="Email campaign pages" className="flex gap-3 text-sm">{page > 1 && <Link href={`?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{page*PAGE_SIZE < (campaigns.count ?? 0) && <Link href={`?page=${page+1}`}>Next</Link>}</nav>
    </section>
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5"><h2 className="text-lg font-semibold">Reusable text templates</h2><p className="text-sm text-muted">Templates are copied into communications; editing a communication does not change its template. Visual design is not available yet.</p>
      {canEdit && <details><summary className="cursor-pointer font-semibold text-teal">Create a template</summary><form action={createTemplate} className="mt-3 space-y-3"><label className="block text-sm">Template name<input name="name" required maxLength={120} className="mt-1 block w-full rounded-lg border border-line p-2" /></label><label className="block text-sm">Template text<textarea name="body" required maxLength={30000} rows={5} className="mt-1 block w-full rounded-lg border border-line p-2" /></label><button className="rounded-lg bg-teal px-4 py-2 text-white">Save template</button></form></details>}
      {!templates.data?.length ? <p className="text-sm text-muted">No templates on this page.</p> : <ul className="divide-y divide-line">{templates.data.map(row => <li key={row.id} className="py-2 text-sm">{row.name}</li>)}</ul>}
      <nav aria-label="Email template pages" className="flex gap-3 text-sm">{templatesPage > 1 && <Link href={`?templatesPage=${templatesPage-1}`}>Previous</Link>}<span>Page {templatesPage}</span>{templatesPage*PAGE_SIZE < (templates.count ?? 0) && <Link href={`?templatesPage=${templatesPage+1}`}>Next</Link>}</nav>
    </section>
  </div>;
}
