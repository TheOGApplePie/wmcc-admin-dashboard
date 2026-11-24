import Link from "next/link";
import type { Registration } from "../lib/registrants";
import { RegistrationFields } from "./RegistrationFields";

export function RegistrationDetailsPanel({ selected, number, clearHref, invalidSelection }: Readonly<{
  selected: Registration | null;
  number: number;
  clearHref: string;
  invalidSelection: boolean;
}>) {
  return (
    <aside aria-labelledby="submission-details" className="min-w-0 rounded-xl border border-line bg-surface lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <h3 id="submission-details" tabIndex={-1} className="scroll-mt-24 font-semibold focus:outline-none">
          {selected ? `Registration ${number} details` : "Submission details"}
        </h3>
        {selected && <Link href={clearHref} prefetch={false} scroll={false} className="text-sm font-semibold text-teal">Clear selection</Link>}
      </div>
      <div className="p-4">
        {selected ? <RegistrationFields key={number} registration={selected} /> : (
          <p className="text-sm text-muted">{invalidSelection ? "This submission is not on the current page. Select a registration to view its details." : "Select a registration to view its details here."}</p>
        )}
      </div>
    </aside>
  );
}
