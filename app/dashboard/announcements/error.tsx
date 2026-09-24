"use client";

export default function AnnouncementsError({ reset }: Readonly<{ reset: () => void }>) {
  return <div role="alert" className="rounded-xl border border-line bg-surface p-6">
    <h2 className="font-semibold">Unable to load announcements</h2>
    <p className="mt-2 text-sm text-muted">Please try again. Your announcements have not been removed.</p>
    <button type="button" onClick={reset} className="mt-4 rounded-lg bg-teal px-4 py-2 text-white">Retry</button>
  </div>;
}
