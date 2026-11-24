import { PageShell } from "@/app/components/ui/PageShell";
import { readEventWorkspace } from "@/features/events/workspace";
import { EventWorkspaceHeader } from "@/features/events/components/EventWorkspaceHeader";

export default async function EventWorkspaceLayout({ children, params }: Readonly<{
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}>) {
  const { event, campaign } = await readEventWorkspace((await params).eventId);
  return <PageShell title="Events" subtitle="Event management">
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-8 rounded-2xl border border-line bg-surface p-4 sm:p-8 lg:p-10">
      <EventWorkspaceHeader event={event} campaign={campaign} />
      {children}
    </div>
  </PageShell>;
}
