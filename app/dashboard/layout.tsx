import SideNav from "./SideNav";
import NotificationInit from "../components/NotificationInit";
import SignoutButton from "@/app/components/signoutButton";
import { AccessSync } from "@/features/access/AccessSync";
import { getViewerAccess } from "@/features/access/server";
import { StoreProvider } from "@/store/StoreProvider";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await getViewerAccess();

  if (!access.profile || access.profile.status !== "active") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-8">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
          <h1 className="text-xl font-bold text-ink">Dashboard access unavailable</h1>
          <p className="mt-2 text-sm text-muted">Your account does not have an active team profile. Contact a Board member for access.</p>
          <div className="mt-5 inline-flex rounded-xl border border-line px-4 py-2 text-sm font-semibold"><SignoutButton /></div>
        </div>
      </div>
    );
  }

  return (
    <StoreProvider access={access}>
      <div className="flex min-h-dvh bg-canvas">
        <AccessSync />
        <NotificationInit />
        <SideNav />
        <div className="ml-17 flex flex-1 flex-col min-h-dvh">
          <main className="flex-1 flex flex-col">{children}</main>
        </div>
      </div>
    </StoreProvider>
  );
}
