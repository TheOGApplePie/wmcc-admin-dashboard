import SideNav from "./SideNav";
import NotificationInit from "../components/NotificationInit";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <NotificationInit />
      <SideNav />
      <div className="ml-[68px] flex flex-1 flex-col min-h-dvh">
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    </div>
  );
}
