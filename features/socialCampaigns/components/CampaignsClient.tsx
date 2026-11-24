"use client";
import styles from "@/features/socialCampaigns/components/CampaignLayout.module.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSocialCalendarPosts } from "@/actions/socialCampaigns";
import { useEffect, useState } from "react";
import type {
  AdminUserOption,
  CampaignEventOption,
  CampaignStatus,
  SocialCalendarPost,
  SocialCampaignSummary,
} from "@/app/schemas/socialCampaigns";
import SocialPostsCalendar, {
  CHANNEL_LABEL,
  SLOT_LABEL,
} from "./SocialPostsCalendar";
import { CampaignForm } from "./CampaignForm";
import ManualPostModal from "./ManualPostModal";
import PostStatusBadge from "./PostStatusBadge";
import WhatsAppAccountButton from "./WhatsAppAccountButton";

export default function CampaignsClient({
  initialCampaigns, statusFilter, page, total,
  calendarDeliveries,
  events,
  adminUsers,
  canEdit,
  canPublish,
  canDelete,
}: Readonly<{
  initialCampaigns: SocialCampaignSummary[];
  statusFilter: CampaignStatus | "current" | "all"; page: number; total: number;
  calendarDeliveries: SocialCalendarPost[];
  events: CampaignEventOption[];
  adminUsers: AdminUserOption[];
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}>) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [deliveries, setDeliveries] = useState(calendarDeliveries);
  const router = useRouter();
  const [campaignsCollapsed, setCampaignsCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  // The selected DTO can come from the calendar, independently of the sidebar page.
  const [editingDelivery, setEditingDelivery] = useState<SocialCalendarPost | null>(null);
  const [manualPostSeed, setManualPostSeed] = useState<{
    campaignId: string | null;
    date: string | null;
  } | null>(null);
  const [selectedDeliveries, setSelectedDeliveries] = useState<SocialCalendarPost[]>([]);
  const [postPage, setPostPage] = useState(1);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedCampaignId) return;
    let cancelled = false;
    getSocialCalendarPosts({ campaignId: selectedCampaignId, page: postPage }).then(result => {
      if (cancelled) return;
      if (!result?.data?.data || result.data.error) { setPostsError(result?.data?.error || "Could not load posts."); return; }
      setPostsError(null); setSelectedDeliveries(result.data.data);
      setHasMorePosts("hasMore" in result.data && Boolean(result.data.hasMore));
    }).catch(() => { if (!cancelled) setPostsError("Could not load posts."); });
    return () => { cancelled = true; };
  }, [selectedCampaignId, postPage, deliveries]);
  const updateDelivery = (updated: SocialCalendarPost) => {
    setDeliveries((current) => current.some((item) => item.id === updated.id)
      ? current.map((item) => item.id === updated.id ? updated : item)
      : [...current, updated]);
    setSelectedDeliveries((current) => current.map((item) => item.id === updated.id ? updated : item));
    setEditingDelivery((current) => current?.id === updated.id ? updated : current);
  };
  const removeDelivery = (id: string) => {
    setDeliveries((current) => current.filter((item) => item.id !== id));
    setSelectedDeliveries((current) => current.filter((item) => item.id !== id));
    setEditingDelivery((current) => current?.id === id ? null : current);
  };

  return (
    <div className={`${styles.page} bg-canvas p-6`}>
      <div className={`${styles.container} mx-auto flex flex-col gap-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <WhatsAppAccountButton canPair={canPublish} />
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
            <button
              type="button"
              aria-expanded={!campaignsCollapsed}
              aria-controls="campaigns-sidebar"
              onClick={() => setCampaignsCollapsed((collapsed) => !collapsed)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted"
            >
              {campaignsCollapsed ? "Show campaigns" : "Hide campaigns"}
            </button>
          </div>
        </div>
        {creating && (
          <CampaignForm
            events={events}
            adminUsers={adminUsers}
            onCancel={() => setCreating(false)}
            onCreated={(campaign) => {
              setCampaigns((current) => [campaign, ...current]);
              router.refresh(); setSelectedCampaignId(null);
              setCreating(false);
            }}
          />
        )}
        <div className="flex flex-col items-start gap-5 xl:flex-row">
          <SocialPostsCalendar
            deliveries={deliveries}
            campaignStatus={statusFilter}
            campaignId={selectedCampaignId}
            canEdit={canEdit}
            canPublish={canPublish}
            canDelete={canDelete}
            onUpdated={updateDelivery}
            onCopied={setDeliveries}
            onDeleted={removeDelivery}
            editingDelivery={editingDelivery}
            onEditDelivery={setEditingDelivery}
            onCloseEditor={() => setEditingDelivery(null)}
            onDateSelect={
              canEdit
                ? (date) =>
                    setManualPostSeed({ campaignId: selectedCampaignId, date })
                : undefined
            }
          />
          <aside id="campaigns-sidebar" aria-label="Campaigns" hidden={campaignsCollapsed} className={`${styles.sidebar} w-full shrink-0 space-y-3 xl:sticky xl:top-18.25 xl:w-96 xl:overflow-y-auto`}>
            <div className="flex items-center justify-between px-1">
              <h2 className="font-semibold text-ink">Campaigns</h2>
              <span className="text-xs text-muted">Newest first</span>
            </div>
            <label className="block px-1 text-xs font-semibold text-ink">
              Campaign status
              <select
                value={statusFilter}
                onChange={(event) => {
                  router.push(`?status=${event.target.value}&page=1`);
                }}
                className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-normal"
              >
                <option value="current">Current (non-archived)</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
                <option value="all">All campaigns</option>
              </select>
            </label>
            {campaigns.length === 0 && (
              <p className="px-1 py-4 text-sm text-muted">No campaigns match this filter.</p>
            )}
            {campaigns.map((campaign) => {
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
                          { setSelectedDeliveries([]); setPostsError(null); setPostPage(1); setSelectedCampaignId(selected ? null : campaign.id); }
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
                        {postsError && <p role="alert">{postsError}</p>}
                        <nav aria-label="Campaign post pages" className="flex justify-between text-xs">
                          <button disabled={postPage === 1} onClick={() => { setSelectedDeliveries([]); setPostPage(value => value - 1); }}>Previous</button>
                          <button disabled={!hasMorePosts} onClick={() => { setSelectedDeliveries([]); setPostPage(value => value + 1); }}>Next</button>
                        </nav>
                        {selectedDeliveries.map((delivery) => (
                          <button
                            type="button"
                            key={delivery.id}
                            onClick={() => setEditingDelivery(delivery)}
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
                              <PostStatusBadge status={delivery.status} needsReview={delivery.needs_review} />
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
            <nav aria-label="Campaign pages" className="flex justify-between text-sm">
              {page > 1 ? <Link href={`?status=${statusFilter}&page=${page - 1}`}>Previous</Link> : <span />}
              {page * 30 < total && <Link href={`?status=${statusFilter}&page=${page + 1}`}>Next</Link>}
            </nav>
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
