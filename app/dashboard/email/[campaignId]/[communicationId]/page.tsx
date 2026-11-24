import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireViewerPermission } from "@/features/access/server";
import { createClient } from "@/utils/supabase/server";
import { applyTemplate, transitionCommunication } from "@/features/email/actions";
import { DraftForm } from "@/features/email/DraftForm";

const input = "mt-1 block w-full rounded-lg border border-line bg-white p-2 font-normal";
export default async function EmailCommunicationPage({ params, searchParams }: Readonly<{
  params: Promise<{ campaignId: string; communicationId: string }>;
  searchParams: Promise<{ saved?: string; templateApplied?: string; templatesPage?: string }>;
}>) {
  const access = await requireViewerPermission("email", "view");
  const ids = await params, query = await searchParams;
  if (!z.uuid().safeParse(ids.campaignId).success || !z.uuid().safeParse(ids.communicationId).success) notFound();
  const templatesPage = Math.min(100000, Math.max(1, Math.floor(Number(query.templatesPage) || 1)));
  const supabase = await createClient();
  const [communication, templates] = await Promise.all([
    supabase.from("email_communications").select("id,campaign_id,title,subject,preheader,sender,audience,trigger_kind,offset_days,body,review_state,revision,approved_at").eq("id", ids.communicationId).eq("campaign_id", ids.campaignId).maybeSingle(),
    supabase.from("email_templates").select("id,name", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((templatesPage-1)*25,templatesPage*25-1),
  ]);
  if (communication.error || templates.error) throw new Error("Unable to load the communication.");
  if (!communication.data) notFound();
  const row = communication.data;
  const canEdit = Boolean(access.permissions["email.edit"]), canApprove = Boolean(access.permissions["email.approve"]);
  const identity = <><input type="hidden" name="campaign" value={ids.campaignId} /><input type="hidden" name="communication" value={row.id} /><input type="hidden" name="revision" value={row.revision} /></>;
  return <div className="mx-auto w-full max-w-4xl space-y-5 p-6"><Link href={`/dashboard/email/${ids.campaignId}`} className="text-sm font-semibold text-teal">Back to campaign</Link>
    <header><h1 className="text-2xl font-bold">{row.title}</h1><p className="mt-2 text-sm">{row.review_state} · revision {row.revision}{row.approved_at && ` · approved ${new Date(row.approved_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}`}</p><p className="text-sm text-muted">Drafting only: no provider is connected and no email is sent.</p></header>
    {(query.saved || query.templateApplied) && <p role="status" className="rounded-lg bg-teal-soft p-3 text-sm">{query.saved ? "Communication saved." : "Template copied into this communication."}</p>}
    {canEdit && templates.data && templates.data.length > 0 && <section className="space-y-2 rounded-xl border border-line p-4"><h2 className="font-semibold">Use a template</h2><p className="text-sm text-muted">Applying a template replaces the saved message text and requires review again if it changes.</p><form action={applyTemplate} className="flex flex-wrap gap-2">{identity}<select name="template" aria-label="Template" required className="rounded-lg border border-line p-2">{templates.data.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select><button className="rounded-lg border border-teal px-3 py-2">Apply template</button></form><nav aria-label="Template pages" className="flex gap-3 text-sm">{templatesPage > 1 && <Link href={`?templatesPage=${templatesPage-1}`}>Previous templates</Link>}<span>Page {templatesPage}</span>{templatesPage*25 < (templates.count ?? 0) && <Link href={`?templatesPage=${templatesPage+1}`}>Next templates</Link>}</nav></section>}
    <DraftForm>{identity}
      <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-75"><label className="block text-sm font-semibold">Communication name<input name="title" required maxLength={120} defaultValue={row.title} className={input} /></label>
      <label className="block text-sm font-semibold">Subject<input name="subject" maxLength={200} defaultValue={row.subject} className={input} /></label>
      <label className="block text-sm font-semibold">Preview text<input name="preheader" maxLength={200} defaultValue={row.preheader} className={input} /></label>
      <label className="block text-sm font-semibold">Sender email<input name="sender" type="email" maxLength={254} defaultValue={row.sender} className={input} /></label>
      <label className="block text-sm font-semibold">Audience description<input name="audience" maxLength={200} defaultValue={row.audience} className={input} /><span className="font-normal text-muted">Planning only; this does not select or sync recipients.</span></label>
      <label className="block text-sm font-semibold">Trigger<select name="trigger" defaultValue={row.trigger_kind} className={input}><option value="manual">Manual</option><option value="registration">Registration</option><option value="relative_to_event">Relative to an event</option></select></label>
      <label className="block text-sm font-semibold">Relative days<input name="offset" type="number" min={-365} max={365} defaultValue={row.offset_days ?? ""} className={input} /><span className="font-normal text-muted">Use a negative number for days before an event.</span></label>
      <label className="block text-sm font-semibold">Message text<textarea name="body" rows={12} maxLength={30000} defaultValue={row.body} className={input} /></label>
      {canEdit && <button className="rounded-lg bg-teal px-4 py-2 font-semibold text-white">Save draft</button>}</fieldset>
    </DraftForm>
    <section className="space-y-3 rounded-xl border border-line p-5"><h2 className="font-semibold">Review</h2><p className="text-sm text-muted">Save changes before submitting. Editing an approved communication returns it to draft; other communications are unaffected.</p>
      <div className="flex flex-wrap gap-2">{canEdit && row.review_state === "draft" && <form action={transitionCommunication}>{identity}<input type="hidden" name="action" value="submit" /><button className="rounded-lg border border-teal px-3 py-2">Submit for review</button></form>}
      {canApprove && row.review_state === "pending" && <><form action={transitionCommunication}>{identity}<input type="hidden" name="action" value="approve" /><button className="rounded-lg bg-teal px-3 py-2 text-white">Approve</button></form><form action={transitionCommunication}>{identity}<input type="hidden" name="action" value="reject" /><button className="rounded-lg border border-line px-3 py-2">Request changes</button></form></>}</div>
    </section>
  </div>;
}
