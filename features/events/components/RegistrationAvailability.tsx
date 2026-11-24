"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useCan } from "@/store/hooks";
import { torontoInputToUtc } from "@/app/utils/date";
import { setRegistrationAvailability } from "../registrationActions";

export type Availability = { configured: boolean; closed: boolean; reopen_at: string | null; revision: number; effective_open: boolean };

export function RegistrationAvailability({ eventId, availability }: Readonly<{ eventId: number; availability: Availability }>) {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const canEdit = useCan("events.edit");
  const router = useRouter();
  let label = "Closed";
  if (!availability.configured) label = "Not configured";
  else if (availability.effective_open) label = "Open";
  else if (availability.reopen_at) label = "Closed until scheduled reopening";
  const run = async (action: "open" | "close" | "schedule") => {
    let reopenAt: string | null = null;
    if (action === "schedule") {
      try { reopenAt = torontoInputToUtc(date).toISOString(); }
      catch { toast.error("Choose a valid reopening date and time."); return; }
      if (Date.parse(reopenAt) <= Date.now()) { toast.error("Choose a reopening time in the future."); return; }
    }
    setBusy(true);
    try {
      const result = await setRegistrationAvailability({ eventId, revision: availability.revision, action, reopenAt });
      if (!result?.data?.success) throw new Error(result?.data?.error || result?.serverError || "Unable to update registration settings.");
      const messages = { schedule: "Reopening scheduled.", close: "Registration closed.", open: "Registration opened." };
      toast.success(messages[action]);
      setDate(""); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to update registration settings."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border border-line p-4" aria-labelledby="registration-availability-heading" aria-busy={busy}>
    <h3 id="registration-availability-heading" className="font-semibold">Registration availability: {label}</h3>
    {availability.reopen_at && !availability.effective_open && <p className="text-sm">Reopens {new Date(availability.reopen_at).toLocaleString("en-CA", { timeZone: "America/Toronto", timeZoneName: "short" })}.</p>}
    <p className="text-sm text-muted">Availability is separate from event publication. Closing hides the embedded form on the public site; direct or already-open Cognito forms may still accept submissions.</p>
    {!availability.configured && <p className="text-sm">Add a Cognito form ID in the event details to configure availability.</p>}
    {availability.configured && canEdit && <div className="flex flex-wrap items-end gap-3">
      <button type="button" disabled={busy || availability.effective_open} onClick={() => run("open")} className="rounded-lg border border-teal px-3 py-2 text-sm font-semibold disabled:opacity-50">Open now</button>
      <button type="button" disabled={busy || (!availability.effective_open && !availability.reopen_at)} onClick={() => run("close")} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50">Close and cancel reopening</button>
      <label className="flex flex-col gap-1 text-sm">Reopen date and time (Toronto)<input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-line px-3 py-2" /></label>
      <button type="button" disabled={busy || !date} onClick={() => run("schedule")} className="rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Close until this time</button>
    </div>}
  </section>;
}
