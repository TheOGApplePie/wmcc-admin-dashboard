import Link from "next/link";
import { AnnouncementPage } from "@/features/announcements";
import { fetchAnnouncements } from "@/features/announcements/actions";
import { requireViewerPermission } from "@/features/access/server";

export default async function Announcements({ searchParams }: Readonly<{ searchParams: Promise<{ scheduledPage?: string; expiredPage?: string }> }>) {
  await requireViewerPermission("announcements", "view");
  const params = await searchParams;
  const pageNumber = (value?: string) => Math.min(100000, Math.max(1, Math.floor(Number(value) || 1)));
  const scheduledPage = pageNumber(params.scheduledPage), expiredPage = pageNumber(params.expiredPage);
  const result = await fetchAnnouncements({ scheduledPage, expiredPage });
  if (!result?.data || result.serverError) throw new Error("Unable to load announcements. Please try again.");
  const data = result.data;
  return <>
    <AnnouncementPage currentAnnouncements={data.live} scheduledAnnouncements={data.scheduled} expiredAnnouncements={data.expired}
      initialTab={params.expiredPage ? "expired" : params.scheduledPage ? "scheduled" : "live"} />
    <nav aria-label="Announcement history pages" className="flex flex-wrap justify-center gap-6 p-4 text-sm">
      <span>Scheduled: {data.scheduledTotal}</span>
      {scheduledPage > 1 && <Link href={`?scheduledPage=${scheduledPage - 1}`}>Previous scheduled</Link>}
      {scheduledPage * 50 < data.scheduledTotal && <Link href={`?scheduledPage=${scheduledPage + 1}`}>Next scheduled</Link>}
      <span>Expired: {data.expiredTotal}</span>
      {expiredPage > 1 && <Link href={`?expiredPage=${expiredPage - 1}`}>Previous expired</Link>}
      {expiredPage * 50 < data.expiredTotal && <Link href={`?expiredPage=${expiredPage + 1}`}>Next expired</Link>}
    </nav>
  </>;
}
