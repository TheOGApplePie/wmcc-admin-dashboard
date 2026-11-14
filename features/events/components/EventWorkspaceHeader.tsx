"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCan } from "@/store/hooks";
import { GuardedLink, useNavigationGuard } from "@/features/navigation/UnsavedChangesProvider";
import type { BaseEvent } from "../domain";
import type { Campaign } from "../lib/eventManagement";
import { useEventMutation } from "../hooks/useEventMutation";
import { EventActions } from "./EventActions";

export function EventWorkspaceHeader({ event, campaign }: Readonly<{ event: BaseEvent; campaign: Campaign | null }>) {
  const pathname = usePathname();
  const canSocial = useCan("social.view");
  const { run, busy, error } = useEventMutation();
  const guard = useNavigationGuard();
  const register = guard?.register;
  useEffect(() => {
    register?.("lifecycle", { dirty: false, busy, discard: () => {} });
    return () => register?.("lifecycle", null);
  }, [register, busy]);
  const base = `/dashboard/events/${event.id}`;
  return <div className="space-y-6 sm:space-y-8">
    <GuardedLink href="/dashboard/events/library" className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink">
      <svg aria-hidden="true" className="shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 5-7 7 7 7M5 12h14" />
      </svg>
      All events
    </GuardedLink>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-3">
        <h2 className="break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">{event.title}</h2>
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold capitalize ${event.publication_status === "published" ? "bg-teal-soft text-teal-dark" : "bg-ink/5 text-muted"}`}>{event.publication_status}</span>
      </div>
      <EventActions event={event} campaign={campaign} run={run} busy={busy || Boolean(guard?.busy)} />
    </div>
    {event.publication_status !== "published" && <p className="rounded-xl bg-amber-50 p-3 text-sm">This event is not public. A linked campaign can be prepared, but cannot activate or publish posts. Publishing this event will not activate its campaign.</p>}
    {busy && <p role="status">Saving changes…</p>}
    {error && <p role="alert" className="text-sm text-coral">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line">
      <nav aria-label="Event workspace" className="flex gap-6">
        {[[base, "Overview"], [`${base}/registrants`, "Registrants"]].map(([href, label]) => <GuardedLink key={href} href={href} aria-current={pathname === href ? "page" : undefined}
          className={`border-b-2 pb-4 pt-2 text-sm transition-colors sm:text-base ${pathname === href ? "border-teal font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label}</GuardedLink>)}
      </nav>
      {canSocial && <GuardedLink href={campaign ? `/dashboard/posts/${campaign.id}` : "/dashboard/posts"}
        title={campaign ? campaign.name : undefined}
        className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-teal-dark">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m3 10 17-6v16L3 14v-4Zm3 5 1 5h4l-2-4" /></svg>
        {campaign ? "Manage campaign" : "Link a campaign in Social Posts"}
        <span aria-hidden="true">↗</span>
      </GuardedLink>}
    </div>
  </div>;
}
