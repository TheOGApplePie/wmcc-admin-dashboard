"use client";

import PlatformDefaultFields from "./PlatformDefaultFields";
import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { createSocialCampaign } from "@/actions/socialCampaigns";
import { CreateCampaignZod } from "@/app/schemas/socialCampaigns";
import type {
  AdminUserOption,
  CampaignEventOption,
  SocialCampaign,
  SocialPostChannel,
  PlatformDefaults,
} from "@/app/schemas/socialCampaigns";
import { CHANNELS } from "../lib/channels";

export function CampaignForm({
  events,
  adminUsers,
  onCreated,
  onCancel,
}: Readonly<{
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
  const [channels, setChannels] = useState<SocialPostChannel[]>([]);
  const [defaults, setDefaults] = useState<PlatformDefaults>();
  const defaultsCustomized = useRef(false);
  const changeDefaults = useCallback((value: PlatformDefaults, initialized?: boolean) => {
    if (!initialized) defaultsCustomized.current = true;
    setDefaults(value);
  }, []);
  const [defaultsReady, setDefaultsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const availableEvents = events;
  const selectedEvent = availableEvents.find(
    (event) => String(event.id) === eventId,
  );

  const toggleChannel = (channel: SocialPostChannel) =>
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );

  const submit = async () => {
    setSaving(true);
    try {
      const input = {
        name,
        description,
        event_id: eventId ? Number(eventId) : null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        default_channels: channels,
        platform_defaults: defaults,
        default_assigned_to: assignee || null,
        launch_occurrence_at: null,
      };
      const validation = CreateCampaignZod.safeParse(input);
      if (!validation.success) return toast.error(validation.error.issues[0].message);
      const result = await createSocialCampaign(input);
      setSaving(false);
      if (result?.data?.error) return toast.error(result.data.error);
      if (result?.data?.data) {
        toast.success("Campaign created.");
        onCreated(result.data.data);
      } else toast.error(result?.serverError || "Could not create campaign.");
    } catch {
      toast.error("Could not create campaign. Your edits are retained.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">New campaign</h2>
          <p className="text-sm text-muted">
            Link an event or leave it standalone.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-muted"
        >
          Cancel
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">
          Campaign name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">
          Objective or description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">
          Linked event{" "}
          <span className="font-normal text-muted">(optional)</span>
          <select
            value={eventId}
            onChange={(e) => { setEventId(e.target.value); if (!defaultsCustomized.current) { setDefaults(undefined); setDefaultsReady(false); } }}
            className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
          >
            <option value="">Standalone campaign</option>
            {availableEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
                {event.publication_status !== "published"
                  ? ` · ${event.publication_status}`
                  : ""}
                {event.is_recurring ? " · recurring" : ""}
              </option>
            ))}
          </select>
          {selectedEvent?.is_recurring && (
            <span className="text-xs font-normal text-muted">
              Launch treatment will be confirmed when its schedule is generated.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Starts
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Ends <span className="font-normal text-muted">(optional)</span>
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink md:col-span-2">
          Default assignee
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 font-normal"
          >
            <option value="">Unassigned</option>
            {adminUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm font-medium text-ink">
            Default platforms
          </legend>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel.value}
                type="button"
                onClick={() => toggleChannel(channel.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${channels.includes(channel.value) ? "border-teal bg-teal-soft text-teal-dark" : "border-line text-muted"}`}
              >
                {channel.label}
              </button>
            ))}
          </div>
        </fieldset>
        <PlatformDefaultFields value={defaults} eventId={eventId ? Number(eventId) : null} channels={channels} onChange={changeDefaults} onReady={setDefaultsReady} />
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          disabled={saving || !defaultsReady || !name.trim()}
          onClick={submit}
          className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create campaign"}
        </button>
      </div>
    </section>
  );
}
