import { PageShell } from "@/app/components/ui/PageShell";
import { requireViewerPermission } from "@/features/access/server";
import { GuardedLink as Link } from "@/features/navigation/UnsavedChangesProvider";
import { BaseEventForm } from "../../../../features/events/components/BaseEventForm";
export default async function NewEvent() {
  await requireViewerPermission("events", "edit");
  return (
    <PageShell
      title="New event"
      subtitle="Create a draft, then add its schedules"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/dashboard/events" className="text-sm underline">
          Back to calendar
        </Link>
        <BaseEventForm />
      </div>
    </PageShell>
  );
}
