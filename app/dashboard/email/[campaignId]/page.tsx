import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewerPermission } from "@/features/access/server";
import { createClient } from "@/utils/supabase/server";
import { createCommunication } from "@/features/email/actions";

export default async function EmailCampaignPage({ params, searchParams }: Readonly<{ params: Promise<{ campaignId: string }>; searchParams: Promise<{ page?: string }> }>) {
  const access = await requireViewerPermission("email", "view");
  const parsed = z.uuid().safeParse((await params).campaignId); if (!parsed.success) notFound();
  const page = Math.min(100000, Math.max(1, Math.floor(Number((await searchParams).page) || 1)));
  const supabase = await createClient();
  const [campaign, communications] = await Promise.all([
    supabase.from("email_campaigns").select("id,name").eq("id", parsed.data).maybeSingle(),
    supabase.from("email_communications").select("id,title,subject,review_state,revision", { count: "exact" }).eq("campaign_id", parsed.data).order("created_at").order("id").range((page-1)*25,page*25-1),
  ]);
  if (campaign.error || communications.error) throw new Error("Unable to load the email campaign.");
  if (!campaign.data) notFound();
  return <div className="mx-auto w-full max-w-4xl space-y-5 p-6"><Link href="/dashboard/email" className="text-sm font-semibold text-teal">Back to email campaigns</Link>
    <h1 className="text-2xl font-bold">{campaign.data.name}</h1><p className="text-sm text-muted">Create communications for this campaign. Nothing is sent or scheduled by this workspace.</p>
    {access.permissions["email.edit"] && <form action={createCommunication} className="flex flex-wrap items-end gap-2"><input type="hidden" name="campaign" value={parsed.data} /><label className="flex-1 text-sm">Communication name<input name="title" required maxLength={120} className="mt-1 block w-full rounded-lg border border-line p-2" /></label><button className="rounded-lg bg-teal px-4 py-2 text-white">Add communication</button></form>}
    {!communications.data?.length ? <p className="rounded-xl border border-line p-4 text-sm text-muted">No communications on this page.</p> : <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{communications.data.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2 p-4"><Link href={`/dashboard/email/${parsed.data}/${row.id}`} className="font-semibold text-teal">{row.title}</Link><span className="text-sm">{row.review_state} · revision {row.revision}</span></li>)}</ul>}
    <nav aria-label="Communication pages" className="flex gap-3 text-sm">{page > 1 && <Link href={`?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{page*25 < (communications.count ?? 0) && <Link href={`?page=${page+1}`}>Next</Link>}</nav>
  </div>;
}
