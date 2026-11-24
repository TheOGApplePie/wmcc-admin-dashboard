import { fetchNotifications } from "@/actions/notifications";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage({ searchParams }: Readonly<{ searchParams: Promise<{ page?: string }> }>) {
  const params = await searchParams;
  const page = Math.min(100000, Math.max(1, Math.floor(Number(params.page) || 1)));
  const result = await fetchNotifications({ page, pageSize: 50 });
  if (!result?.data || result.data.error || result.serverError) throw new Error(result?.data?.error || result?.serverError || "Could not load notifications.");
  return <NotificationsClient key={page} initialNotifications={result.data.notifications} initialUnread={result.data.unreadCount} page={page} total={result.data.total ?? 0} />;
}
