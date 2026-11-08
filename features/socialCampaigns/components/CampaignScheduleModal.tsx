"use client";
import styles from "@/features/socialCampaigns/components/CampaignLayout.module.css";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  generateCampaignProposal,
  getSocialCalendarPosts,
} from "@/actions/socialCampaigns";
import type {
  SocialCalendarPost,
  SocialCampaign,
} from "@/app/schemas/socialCampaigns";
import SocialPostsCalendar from "./SocialPostsCalendar";
import { schedulePlatformFor, scheduledAtFor } from "@/features/socialCampaigns/scheduling";

export default function CampaignScheduleModal({
  campaign,
  deliveries,
  canEdit,
  canPublish,
  canDelete,
  onClose,
  onDeliveriesChanged,
}: Readonly<{
  campaign: SocialCampaign;
  deliveries: SocialCalendarPost[];
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
  onClose: () => void;
  onDeliveriesChanged: (deliveries: SocialCalendarPost[]) => void;
}>) {
  type GenerationData = NonNullable<NonNullable<Awaited<ReturnType<typeof generateCampaignProposal>>>["data"]>;
  const [preview, setPreview] = useState<GenerationData["data"] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launchBehavior, setLaunchBehavior] = useState<
    "next" | "reminders_only"
  >("next");
  const [editingDelivery, setEditingDelivery] =
    useState<SocialCalendarPost | null>(null);
  const needsLaunchDecision = Boolean(
    campaign.event_id && !campaign.launch_decision_made,
  );
  const campaignPosts = deliveries.filter(
    (delivery) => delivery.campaign_id === campaign.id,
  );
  const previewPosts = useMemo<SocialCalendarPost[]>(() =>
    (preview?.proposals ?? []).flatMap((proposal) => proposal.channels.flatMap((channel) => {
      const suggestion = proposal.suggestions[channel];
      if (!suggestion) return [];
      return [{
        id: `preview:${proposal.generationKey}:${channel}`,
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        version: 0,
        needs_review: false,
        review_reason: null,
        post_title: proposal.title,
        caption: proposal.caption ?? "",
        media_items: proposal.mediaUrl ? [{ url: proposal.mediaUrl, alt_text: proposal.mediaAlt ?? "" }] : [],
        hashtags: [],
        channel,
        schedule_platform: schedulePlatformFor(channel),
        scheduled_date: suggestion.date,
        time_slot: suggestion.slot,
        scheduled_at: scheduledAtFor(suggestion.date, suggestion.slot),
        status: "proposed",
        attempt_count: 0,
        retryable: false,
        next_attempt_at: null,
        provider_error: null,
      }];
    })), [preview, campaign.id, campaign.name, campaign.status]);
  const generate = async (save = false) => {
    setWorking(true);
    setError(null);
    try {
      const result = await generateCampaignProposal({
        id: campaign.id,
        preview: !save,
        ...(needsLaunchDecision ? { launch_behavior: launchBehavior } : {}),
      });
      if (!result?.data || result.data.error)
        throw new Error(
          result?.data?.error ||
            result?.serverError ||
            "Could not generate the campaign schedule.",
        );
      if (!save) {
        setPreview(result.data.data);
      const suppressed = result.data.data?.suppressed ?? 0;
        if (suppressed) setError(`${suppressed} reminders could not be assigned a slot or overlapped another reminder.`);
        return;
      }
      setPreview(null);
      const refreshed = await getSocialCalendarPosts();
      if (!refreshed?.data || refreshed.data.error)
        throw new Error(
          refreshed?.data?.error ||
            refreshed?.serverError ||
            "Schedule generated, but refreshing failed. Reopen the calendar to retry.",
        );
      onDeliveriesChanged(refreshed.data.data ?? deliveries);
      const suppressed = result.data.data?.suppressed ?? 0;
      if (suppressed) setError(`${suppressed} reminders could not be assigned a slot or overlapped another reminder. Review the campaign calendar and add posts where needed.`);
      const inserted = result.data.data?.inserted ?? 0;
      toast.success(
        inserted
          ? `${inserted} proposals created.`
          : "Campaign coverage is already up to date.",
      );
    } catch (failure) {
      const message =
        failure instanceof Error
          ? failure.message
          : "Could not generate the campaign schedule.";
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };
  let generateLabel = "Generate initial schedule";
  if (campaign.generated_through) generateLabel = "Extend schedule";
  if (working) generateLabel = "Generating…";

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/50 p-3 md:p-6"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-review-title"
        className={`${styles.dialog} mx-auto rounded-2xl bg-canvas p-4 shadow-xl md:p-6`}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="schedule-review-title"
              className="text-xl font-semibold text-ink"
            >
              Generate and review schedule
            </h2>
            <p className="text-sm text-muted">
              {campaign.name} · highlighted posts belong to this campaign. Other
              posts remain visible so occupied slots are clear.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted"
          >
            Close
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4">
          <div className="mr-auto">
            <p className="text-sm font-semibold text-ink">
              {campaign.generated_through
                ? `Generated through ${campaign.generated_through}`
                : "No schedule generated yet"}
            </p>
            <p className="text-xs text-muted">
              {campaignPosts.length} platform post
              {campaignPosts.length === 1 ? "" : "s"} currently visible for this
              campaign.
            </p>
          </div>
          {needsLaunchDecision && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Next recurring occurrence
              <select
                value={launchBehavior}
                disabled={working || Boolean(preview)}
                onChange={(event) =>
                  setLaunchBehavior(event.target.value as typeof launchBehavior)
                }
                className="rounded-lg border border-line bg-white px-3 py-2 font-normal"
              >
                <option value="next">Treat as launch occurrence</option>
                <option value="reminders_only">Reminders only</option>
              </select>
            </label>
          )}
          {canPublish && campaign.event_id && campaign.generation_enabled && (
            <button
              type="button"
              disabled={
                working || Boolean(preview) ||
                Boolean(
                  campaign.events &&
                  campaign.events.publication_status !== "published",
                )
              }
              onClick={() => generate()}
              className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {generateLabel}
            </button>
          )}
        </div>
        {working && (
          <p role="status" className="mb-4 text-sm text-muted">
            {preview ? "Saving schedule…" : "Generating preview…"}
          </p>
        )}
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {preview && (
          <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <p className="mr-auto text-sm font-semibold text-ink">
                Unsaved schedule through {preview.generated_through}. Save to commit, or discard to undo generation.
              </p>
              <button type="button" disabled={working} onClick={() => { setPreview(null); setError(null); }}
                className="rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">Discard</button>
              <button type="button" disabled={working} onClick={() => generate(true)}
              className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
            </div>
            <p className="mb-2 text-xs text-muted">Closing this window discards the unsaved generation.</p>
            <p className="text-sm text-muted">
              {previewPosts.length ? `${previewPosts.length} unsaved proposals shown in the calendar.` : "No new posts in this coverage period."}
            </p>
          </div>
        )}
        <SocialPostsCalendar
          deliveries={deliveries}
          previewPosts={previewPosts}
          campaignId={null}
          highlightCampaignId={campaign.id}
          canEdit={canEdit}
          canPublish={canPublish}
          canDelete={canDelete}
          onCopied={onDeliveriesChanged}
          onUpdated={(updated) =>
            onDeliveriesChanged(
              deliveries.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            )
          }
          onDeleted={(id) =>
            onDeliveriesChanged(deliveries.filter((item) => item.id !== id))
          }
          editingDelivery={editingDelivery}
          onEditDelivery={setEditingDelivery}
          onCloseEditor={() => setEditingDelivery(null)}
        />
      </section>
    </div>
  );
}
