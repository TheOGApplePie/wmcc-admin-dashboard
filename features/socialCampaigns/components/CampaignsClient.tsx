"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { createSocialCampaign } from "@/actions/socialCampaigns";
import type { AdminUserOption, CampaignEventOption, SocialCalendarDelivery, SocialCampaign, VariantChannel } from "@/app/schemas/socialCampaigns";
import SocialPostsCalendar, { CHANNEL_LABEL, PLATFORM, SLOT_LABEL } from "./SocialPostsCalendar";
import ManualPostModal from "./ManualPostModal";

const CHANNELS: Array<{ value: VariantChannel; label: string }> = [
  { value: "instagram_feed", label: "Instagram Feed" },
  { value: "instagram_story", label: "Instagram Story" },
  { value: "instagram_reel", label: "Instagram Reel" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "tiktok_reel", label: "TikTok Reel" },
];

function CampaignForm({ events, adminUsers, onCreated, onCancel }: Readonly<{
  events: CampaignEventOption[];
  adminUsers: AdminUserOption[];
  onCreated: (campaign: SocialCampaign) => void;
  onCancel: () => void;
}>) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventId, setEventId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [assignee, setAssignee] = useState("");
  const [channels, setChannels] = useState<VariantChannel[]>([]);
  const [saving, setSaving] = useState(false);
  const availableEvents = events.filter((event) => !event.campaign_id);
  const selectedEvent = availableEvents.find((event) => String(event.id) === eventId);

  const toggleChannel = (channel: VariantChannel) => setChannels((current) =>
    current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);

  const submit = async () => {
    setSaving(true);
    const result = await createSocialCampaign({
      name, description,
      event_id: eventId ? Number(eventId) : null,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      default_channels: channels,
      default_assigned_to: assignee || null,
      launch_occurrence_at: null,
    });
    setSaving(false);
    if (result?.data?.error) return toast.error(result.data.error);
    if (result?.data?.data) {
      toast.success("Campaign created.");
      onCreated(result.data.data);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div><h2 className="text-lg font-semibold text-ink">New campaign</h2><p className="text-sm text-muted">Link an event or leave it standalone.</p></div>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-muted">Cancel</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Campaign name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Objective or description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Linked event <span className="font-normal text-muted">(optional)</span><select value={eventId} onChange={(e) => setEventId(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal"><option value="">Standalone campaign</option>{availableEvents.map((event) => <option key={event.id} value={event.id}>{event.title}{event.is_recurring ? " · recurring" : ""}</option>)}</select>{selectedEvent?.is_recurring && <span className="text-xs font-normal text-muted">Launch treatment will be confirmed when its schedule is generated.</span>}</label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Starts<input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Ends <span className="font-normal text-muted">(optional)</span><input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">Default assignee<select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 font-normal"><option value="">Unassigned</option>{adminUsers.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></label>
        <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-medium text-ink">Default platforms</legend><div className="flex flex-wrap gap-2">{CHANNELS.map((channel) => <button key={channel.value} type="button" onClick={() => toggleChannel(channel.value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${channels.includes(channel.value) ? "border-teal bg-teal-soft text-teal-dark" : "border-line text-muted"}`}>{channel.label}</button>)}</div></fieldset>
      </div>
      <div className="mt-5 flex justify-end"><button type="button" disabled={saving || !name.trim()} onClick={submit} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Creating…" : "Create campaign"}</button></div>
    </section>
  );
}

export default function CampaignsClient({ initialCampaigns, calendarDeliveries, events, adminUsers, canEdit, canSchedule, canSend, canDelete }: Readonly<{
  initialCampaigns: SocialCampaign[];
  calendarDeliveries: SocialCalendarDelivery[];
  events: CampaignEventOption[];
  adminUsers: AdminUserOption[];
  canEdit: boolean;
  canSchedule: boolean;
  canSend: boolean;
  canDelete: boolean;
}>) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [deliveries, setDeliveries] = useState(calendarDeliveries);
  const [creating, setCreating] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [editDeliveryId, setEditDeliveryId] = useState<string | null>(null);
  const [manualPostSeed, setManualPostSeed] = useState<{ campaignId: string | null; date: string | null } | null>(null);
  const sortedCampaigns = useMemo(() => [...campaigns].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), [campaigns]);
  const selectedDeliveries = useMemo(() => deliveries.filter((delivery) => delivery.campaign_id === selectedCampaignId).sort((a, b) => `${a.scheduled_date ?? "9999"}-${a.time_slot ?? ""}`.localeCompare(`${b.scheduled_date ?? "9999"}-${b.time_slot ?? ""}`)), [deliveries, selectedCampaignId]);
  const editingDelivery = deliveries.find((delivery) => delivery.id === editDeliveryId) ?? null;
  const updateDelivery = (updated: SocialCalendarDelivery) => setDeliveries((current) => current.map((item) => item.id === updated.id ? updated : item));
  const removeDelivery = (id: string) => setDeliveries((current) => current.filter((item) => item.id !== id));

  return (
    <div className="min-h-[calc(100dvh-4.5rem)] bg-canvas p-6"><div className="mx-auto flex max-w-[1600px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div>{selectedCampaignId && <button type="button" onClick={() => setSelectedCampaignId(null)} className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted">Show all campaigns</button>}</div><div className="flex gap-2">{canEdit && <><button type="button" onClick={() => setManualPostSeed({ campaignId: selectedCampaignId, date: null })} className="rounded-xl border border-teal bg-surface px-4 py-2 text-sm font-semibold text-teal-dark">New post</button><button type="button" onClick={() => setCreating(true)} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white">New campaign</button></>}</div></div>
      {creating && <CampaignForm events={events} adminUsers={adminUsers} onCancel={() => setCreating(false)} onCreated={(campaign) => { setCampaigns((current) => [campaign, ...current]); setCreating(false); }} />}
      <div className="flex flex-col items-start gap-5 xl:flex-row">
        <SocialPostsCalendar deliveries={deliveries} campaignId={selectedCampaignId} canEdit={canEdit} canSchedule={canSchedule} canSend={canSend} canDelete={canDelete} onUpdated={updateDelivery} onDeleted={removeDelivery} editingDelivery={editingDelivery} onEditDelivery={(delivery) => setEditDeliveryId(delivery.id)} onCloseEditor={() => setEditDeliveryId(null)} onDateSelect={canEdit ? (date) => setManualPostSeed({ campaignId: selectedCampaignId, date }) : undefined} />
        <aside className="w-full shrink-0 space-y-3 xl:sticky xl:top-18.25 xl:max-h-[calc(100dvh-6rem)] xl:w-96 xl:overflow-y-auto">
          <div className="flex items-center justify-between px-1"><h2 className="font-semibold text-ink">Campaigns</h2><span className="text-xs text-muted">Newest first</span></div>
          {sortedCampaigns.map((campaign) => {
            const selected = campaign.id === selectedCampaignId;
            return <article key={campaign.id} className={`rounded-2xl border bg-surface p-4 shadow-sm ${selected ? "border-teal ring-1 ring-teal" : "border-line"}`}>
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{campaign.name}</h3><p className="mt-1 line-clamp-2 text-xs text-muted">{campaign.description || "No description"}</p></div><span className="rounded-full bg-teal-soft px-2 py-1 text-[10px] font-semibold uppercase text-teal-dark">{campaign.status}</span></div>
              <div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted">{new Date(campaign.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}</span><div className="flex flex-wrap justify-end gap-2"><Link href={`/dashboard/posts/${campaign.id}`} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted">Campaign page</Link>{canEdit && <button type="button" onClick={() => setManualPostSeed({ campaignId: campaign.id, date: null })} className="rounded-lg border border-teal px-2.5 py-1.5 text-xs font-semibold text-teal-dark">Add post</button>}<button type="button" onClick={() => setSelectedCampaignId(selected ? null : campaign.id)} className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white">{selected ? "Clear" : "Edit posts"}</button></div></div>
              {selected && <div className="mt-4 border-t border-line pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Social posts</p><div className="space-y-2">{selectedDeliveries.map((delivery) => <button type="button" key={delivery.id} onClick={() => setEditDeliveryId(delivery.id)} disabled={!canEdit && !canDelete} className="block w-full rounded-xl bg-canvas p-3 text-left transition hover:ring-1 hover:ring-teal disabled:cursor-default disabled:hover:ring-0"><div className="flex items-center justify-between gap-2"><span className="rounded-full px-2 py-1 text-[10px] font-semibold" style={{ color: PLATFORM[delivery.schedule_platform].color, backgroundColor: PLATFORM[delivery.schedule_platform].soft }}>{CHANNEL_LABEL[delivery.channel]}</span><span className="text-[10px] font-semibold uppercase text-muted">{delivery.status}</span></div><p className="mt-2 line-clamp-1 text-xs font-semibold text-ink">{delivery.post_title}</p><p className="mt-1 text-xs text-muted">{delivery.scheduled_date && delivery.time_slot ? `${delivery.scheduled_date} · ${SLOT_LABEL[delivery.time_slot]}` : "Unscheduled draft"}</p></button>)}{selectedDeliveries.length === 0 && <p className="py-3 text-center text-xs text-muted">No posts yet.</p>}</div></div>}
            </article>;
          })}
        </aside>
      </div>
      {manualPostSeed && <ManualPostModal campaigns={campaigns} initialCampaignId={manualPostSeed.campaignId} initialDate={manualPostSeed.date} canSchedule={canSchedule} onClose={() => setManualPostSeed(null)} onCreated={setDeliveries} />}
    </div></div>
  );
}
