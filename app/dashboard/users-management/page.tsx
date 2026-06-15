import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { TeamPage } from "@/features/team";
import type { Profile } from "@/features/team/types";

export default async function UsersManagement() {
  const supabase = await createClient();

  // Gate: only users with users.view can see the roster
  const { data: canView } = await supabase.rpc("has_perm", {
    p_module: "users",
    p_action: "view",
  });

  if (!canView) {
    redirect("/dashboard");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("display_name")
    .overrideTypes<Profile[]>();

  return (
    <TeamPage
      profiles={profiles ?? []}
      currentUserId={user?.id ?? null}
    />
  );
}
