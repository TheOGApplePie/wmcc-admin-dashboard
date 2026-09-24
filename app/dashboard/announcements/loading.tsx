export default function AnnouncementsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="rounded-xl border border-line bg-surface p-6 text-muted"
    >
      Loading announcements
    </div>
  );
}
