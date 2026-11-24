"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/utils/permissions";

const id = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const field = (form: FormData, name: string) => String(form.get(name) ?? "");
const campaignPath = (campaign: string) => `/dashboard/email/${campaign}`;

export async function createCampaign(form: FormData) {
  const name = text(120).min(1).parse(field(form, "name"));
  const { supabase } = await requirePermission("email", "edit");
  const { data, error } = await supabase.rpc("create_email_campaign", { p_name: name });
  if (error) throw new Error("Unable to create the email campaign.");
  revalidatePath("/dashboard/email");
  redirect(campaignPath(id.parse(data)));
}
export async function createTemplate(form: FormData) {
  const name = text(120).min(1).parse(field(form, "name"));
  const body = z.string().max(30000).parse(field(form, "body"));
  const { supabase } = await requirePermission("email", "edit");
  const { error } = await supabase.rpc("create_email_template", { p_name: name, p_body: body });
  if (error) throw new Error("Unable to create the template.");
  revalidatePath("/dashboard/email");
}
export async function createCommunication(form: FormData) {
  const campaign = id.parse(field(form, "campaign"));
  const title = text(120).min(1).parse(field(form, "title"));
  const { supabase } = await requirePermission("email", "edit");
  const { data, error } = await supabase.rpc("create_email_communication", { p_campaign_id: campaign, p_title: title });
  if (error) throw new Error("Unable to create the communication.");
  revalidatePath(campaignPath(campaign));
  redirect(`${campaignPath(campaign)}/${id.parse(data)}`);
}
export async function saveCommunication(form: FormData) {
  const campaign = id.parse(field(form, "campaign"));
  const communication = id.parse(field(form, "communication"));
  const revision = z.coerce.number().int().positive().parse(field(form, "revision"));
  const trigger = z.enum(["manual", "registration", "relative_to_event"]).parse(field(form, "trigger"));
  const offset = field(form, "offset");
  const { supabase } = await requirePermission("email", "edit");
  const { error } = await supabase.rpc("save_email_communication", {
    p_id: communication, p_revision: revision, p_title: text(120).min(1).parse(field(form, "title")),
    p_subject: text(200).parse(field(form, "subject")), p_preheader: text(200).parse(field(form, "preheader")),
    p_sender: text(254).parse(field(form, "sender")), p_audience: text(200).parse(field(form, "audience")),
    p_trigger_kind: trigger, p_offset_days: offset ? z.coerce.number().int().min(-365).max(365).parse(offset) : null,
    p_body: z.string().max(30000).parse(field(form, "body")),
  });
  if (error?.code === "40001") throw new Error("This communication changed. Reload before saving.");
  if (error) throw new Error("Unable to save the communication. Check its fields and try again.");
  revalidatePath(campaignPath(campaign));
  redirect(`${campaignPath(campaign)}/${communication}?saved=1`);
}
export async function transitionCommunication(form: FormData) {
  const campaign = id.parse(field(form, "campaign"));
  const communication = id.parse(field(form, "communication"));
  const revision = z.coerce.number().int().positive().parse(field(form, "revision"));
  const action = z.enum(["submit", "approve", "reject"]).parse(field(form, "action"));
  const { supabase } = await requirePermission("email", action === "submit" ? "edit" : "approve");
  const { error } = await supabase.rpc("transition_email_communication", { p_id: communication, p_revision: revision, p_action: action });
  if (error?.code === "40001") throw new Error("This communication changed. Reload before continuing.");
  if (error) throw new Error(error.message);
  revalidatePath(campaignPath(campaign));
  redirect(`${campaignPath(campaign)}/${communication}`);
}
export async function applyTemplate(form: FormData) {
  const campaign = id.parse(field(form, "campaign"));
  const communication = id.parse(field(form, "communication"));
  const template = id.parse(field(form, "template"));
  const revision = z.coerce.number().int().positive().parse(field(form, "revision"));
  const { supabase } = await requirePermission("email", "edit");
  const [current, selected] = await Promise.all([
    supabase.from("email_communications").select("id,campaign_id,revision,title,subject,preheader,sender,audience,trigger_kind,offset_days").eq("id", communication).eq("campaign_id", campaign).single(),
    supabase.from("email_templates").select("body").eq("id", template).single(),
  ]);
  if (current.error || selected.error || !current.data || !selected.data) throw new Error("Unable to load the communication or template.");
  if (current.data.revision !== revision) throw new Error("This communication changed. Reload before applying a template.");
  const row = current.data;
  const { error } = await supabase.rpc("save_email_communication", {
    p_id: row.id, p_revision: revision, p_title: row.title, p_subject: row.subject, p_preheader: row.preheader,
    p_sender: row.sender, p_audience: row.audience, p_trigger_kind: row.trigger_kind, p_offset_days: row.offset_days, p_body: selected.data.body,
  });
  if (error) throw new Error("Unable to apply the template. Reload and try again.");
  revalidatePath(campaignPath(campaign));
  redirect(`${campaignPath(campaign)}/${communication}?templateApplied=1`);
}
