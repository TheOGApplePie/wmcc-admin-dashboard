import SideNav from "./SideNav";
import NotificationInit from "../components/NotificationInit";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: canViewSocial } = await supabase.rpc("has_perm", {
    p_module: "social",
    p_action: "view",
  });
  return (
    <div className="flex min-h-dvh bg-canvas">
      <NotificationInit />
      <SideNav canViewSocial={Boolean(canViewSocial)} />
      <div className="ml-17 flex flex-1 flex-col min-h-dvh">
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    </div>
  );
}
