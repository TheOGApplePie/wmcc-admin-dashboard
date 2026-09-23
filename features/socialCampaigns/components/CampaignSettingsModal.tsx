"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { updateSocialCampaign } from "@/actions/socialCampaigns";
import type { AdminUserOption, CampaignEventOption, CampaignStatus, SocialCampaign, VariantChannel } from "@/app/schemas/socialCampaigns";

const CHANNELS: Array<{ value: VariantChannel; label: string }> = [
  { value: "instagram_feed", label: "Instagram Feed" }, { value: "instagram_story", label: "Instagram Story" },
  { value: "instagram_reel", label: "Instagram Reel" }, { value: "whatsapp", label: "WhatsApp" },
  { value: "tiktok_reel", label: "TikTok Reel" },
];

export default function CampaignSettingsForm({ campaign, events, adminUsers, canEdit, canSchedule, onSaved }: Readonly<{
  campaign: SocialCampaign; events: CampaignEventOption[]; adminUsers: AdminUserOption[];
  canEdit: boolean; canSchedule: boolean; onSaved: (campaign: SocialCampaign) => void;
}>) {
  const [form, setForm] = useState(campaign);
  const [saving, setSaving] = useState(false);
  const availableEvents = events.filter((event) => !event.campaign_id || event.campaign_id === campaign.id);
  const toggleChannel = (channel: VariantChannel) => setForm((current) => ({ ...current, default_channels: current.default_channels.includes(channel) ? current.default_channels.filter((item) => item !== channel) : [...current.default_channels, channel] }));
  const save = async () => {
    setSaving(true);
    const result = await updateSocialCampaign({
      id: form.id, name: form.name, description: form.description, event_id: form.event_id,
      starts_on: form.starts_on, ends_on: form.ends_on, default_channels: form.default_channels,
      default_assigned_to: form.default_assigned_to, launch_occurrence_at: form.launch_occurrence_at,
      status: form.status,
    });
    setSaving(false);
    if (result?.data?.error) return toast.error(result.data.error);
    if (result?.data?.data) onSaved(result.data.data);
    toast.success("Campaign settings updated.");
  };

  return <section aria-labelledby="campaign-settings-title" className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-5"><h2 id="campaign-settings-title" className="text-xl font-semibold text-ink">Campaign settings</h2><p className="text-sm text-muted">Defaults apply to newly generated posts.</p></div>
      <fieldset disabled={!canEdit || saving} className="grid gap-4 disabled:opacity-75 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Linked event<select value={form.event_id ?? ""} onChange={(event) => setForm({ ...form, event_id: event.target.value ? Number(event.target.value) : null })} className="rounded-xl border border-line bg-white px-3 py-2 font-normal"><option value="">Standalone campaign</option>{availableEvents.map((event) => <option key={event.id} value={event.id}>{event.title}{event.is_recurring ? " · recurring" : ""}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Starts<input type="date" value={form.starts_on ?? ""} onChange={(event) => setForm({ ...form, starts_on: event.target.value || null })} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Ends<input type="date" value={form.ends_on ?? ""} onChange={(event) => setForm({ ...form, ends_on: event.target.value || null })} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Status<select disabled={!canSchedule} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CampaignStatus })} className="rounded-xl border border-line bg-white px-3 py-2 font-normal"><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Default assignee<select value={form.default_assigned_to ?? ""} onChange={(event) => setForm({ ...form, default_assigned_to: event.target.value || null })} className="rounded-xl border border-line bg-white px-3 py-2 font-normal"><option value="">Unassigned</option>{adminUsers.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></label>
        <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-medium text-ink">Default platforms</legend><div className="flex flex-wrap gap-2">{CHANNELS.map((channel) => <button key={channel.value} type="button" onClick={() => toggleChannel(channel.value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${form.default_channels.includes(channel.value) ? "border-teal bg-teal-soft text-teal-dark" : "border-line text-muted"}`}>{channel.label}</button>)}</div></fieldset>
      </fieldset>
      <div className="mt-6 flex items-center justify-between gap-2">{!canEdit && <p className="text-xs text-muted">You have read-only access to campaign settings.</p>}<div className="ml-auto">{canEdit && <button type="button" disabled={saving || !form.name.trim()} onClick={save} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save settings"}</button>}</div></div>
    </section>;
}
