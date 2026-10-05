"use client";
import styles from "@/features/socialCampaigns/components/CampaignLayout.module.css";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  AdminUserOption,
  CampaignEventOption,
  SocialCalendarPost,
  SocialCampaign,
} from "@/app/schemas/socialCampaigns";
import SocialPostsCalendar, {
  CHANNEL_LABEL,
  SLOT_LABEL,
} from "./SocialPostsCalendar";
import { CampaignForm } from "./CampaignForm";
import ManualPostModal from "./ManualPostModal";

export default function CampaignsClient({
  initialCampaigns,
  calendarDeliveries,
  events,
  adminUsers,
  canEdit,
  canPublish,
  canDelete,
}: Readonly<{
  initialCampaigns: SocialCampaign[];
  calendarDeliveries: SocialCalendarPost[];
  events: CampaignEventOption[];
  adminUsers: AdminUserOption[];
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}>) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [deliveries, setDeliveries] = useState(calendarDeliveries);
  const [creating, setCreating] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [editDeliveryId, setEditDeliveryId] = useState<string | null>(null);
  const [manualPostSeed, setManualPostSeed] = useState<{
    campaignId: string | null;
    date: string | null;
  } | null>(null);
  const sortedCampaigns = useMemo(
    () =>
      [...campaigns].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      ),
    [campaigns],
  );
  const selectedDeliveries = useMemo(
    () =>
      deliveries
        .filter((delivery) => delivery.campaign_id === selectedCampaignId)
        .sort((a, b) =>
          `${a.scheduled_date ?? "9999"}-${a.time_slot ?? ""}`.localeCompare(
            `${b.scheduled_date ?? "9999"}-${b.time_slot ?? ""}`,
          ),
        ),
    [deliveries, selectedCampaignId],
  );
  const editingDelivery =
    deliveries.find((delivery) => delivery.id === editDeliveryId) ?? null;
  const updateDelivery = (updated: SocialCalendarPost) =>
    setDeliveries((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  const removeDelivery = (id: string) =>
    setDeliveries((current) => current.filter((item) => item.id !== id));

  return (
    <div className={`${styles.page} bg-canvas p-6`}>
      <div className={`${styles.container} mx-auto flex flex-col gap-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {selectedCampaignId && (
              <button
                type="button"
                onClick={() => setSelectedCampaignId(null)}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted"
              >
                Show all campaigns
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setManualPostSeed({
                      campaignId: selectedCampaignId,
                      date: null,
                    })
                  }
                  className="rounded-xl border border-teal bg-surface px-4 py-2 text-sm font-semibold text-teal-dark"
                >
                  New post
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white"
                >
                  New campaign
                </button>
              </>
            )}
          </div>
        </div>
        {creating && (
          <CampaignForm
            events={events}
            adminUsers={adminUsers}
            onCancel={() => setCreating(false)}
            onCreated={(campaign) => {
              setCampaigns((current) => [campaign, ...current]);
              setCreating(false);
            }}
          />
        )}
        <div className="flex flex-col items-start gap-5 xl:flex-row">
          <SocialPostsCalendar
            deliveries={deliveries}
            campaignId={selectedCampaignId}
            canEdit={canEdit}
            canPublish={canPublish}
            canDelete={canDelete}
            onUpdated={updateDelivery}
            onDeleted={removeDelivery}
            editingDelivery={editingDelivery}
            onEditDelivery={(delivery) => setEditDeliveryId(delivery.id)}
            onCloseEditor={() => setEditDeliveryId(null)}
            onDateSelect={
              canEdit
                ? (date) =>
                    setManualPostSeed({ campaignId: selectedCampaignId, date })
                : undefined
            }
          />
          <aside className={`${styles.sidebar} w-full shrink-0 space-y-3 xl:sticky xl:top-18.25 xl:w-96 xl:overflow-y-auto`}>
            <div className="flex items-center justify-between px-1">
              <h2 className="font-semibold text-ink">Campaigns</h2>
              <span className="text-xs text-muted">Newest first</span>
            </div>
            {sortedCampaigns.map((campaign) => {
              const selected = campaign.id === selectedCampaignId;
              return (
                <article
                  key={campaign.id}
                  className={`rounded-2xl border bg-surface p-4 shadow-sm ${selected ? "border-teal ring-1 ring-teal" : "border-line"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-ink">
                        {campaign.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">
                        {campaign.description || "No description"}
                      </p>
                    </div>
                    <span className="rounded-full bg-teal-soft px-2 py-1 text-micro font-semibold uppercase text-teal-dark">
                      {campaign.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {new Date(campaign.created_at).toLocaleDateString(
                        "en-CA",
                        { year: "numeric", month: "short", day: "numeric" },
                      )}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/dashboard/posts/${campaign.id}`}
                        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted"
                      >
                        Campaign page
                      </Link>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setManualPostSeed({
                              campaignId: campaign.id,
                              date: null,
                            })
                          }
                          className="rounded-lg border border-teal px-2.5 py-1.5 text-xs font-semibold text-teal-dark"
                        >
                          Add post
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCampaignId(selected ? null : campaign.id)
                        }
                        className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold text-white"
                      >
                        {selected ? "Clear" : "Edit posts"}
                      </button>
                    </div>
                  </div>
                  {selected && (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        Social posts
                      </p>
                      <div className="space-y-2">
                        {selectedDeliveries.map((delivery) => (
                          <button
                            type="button"
                            key={delivery.id}
                            onClick={() => setEditDeliveryId(delivery.id)}
                            disabled={!canEdit && !canDelete}
                            className="block w-full rounded-xl bg-canvas p-3 text-left transition hover:ring-1 hover:ring-teal disabled:cursor-default disabled:hover:ring-0"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={`${styles.platformBadge} rounded-full px-2 py-1 text-micro font-semibold`}
                                data-platform={delivery.schedule_platform}
                              >
                                {CHANNEL_LABEL[delivery.channel]}
                              </span>
                              <span className="text-micro font-semibold uppercase text-muted">
                                {delivery.status}
                              </span>
                            </span>
                            <span className="block mt-2 line-clamp-1 text-xs font-semibold text-ink">
                              {delivery.post_title}
                            </span>
                            <span className="block mt-1 text-xs text-muted">
                              {delivery.scheduled_date && delivery.time_slot
                                ? `${delivery.scheduled_date} · ${SLOT_LABEL[delivery.time_slot]}`
                                : "Unscheduled draft"}
                            </span>
                          </button>
                        ))}
                        {selectedDeliveries.length === 0 && (
                          <p className="py-3 text-center text-xs text-muted">
                            No posts yet.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </aside>
        </div>
        {manualPostSeed && (
          <ManualPostModal
            campaigns={campaigns}
            initialCampaignId={manualPostSeed.campaignId}
            initialDate={manualPostSeed.date}
            canPublish={canPublish}
            onClose={() => setManualPostSeed(null)}
            onCreated={setDeliveries}
          />
        )}
      </div>
    </div>
  );
}
