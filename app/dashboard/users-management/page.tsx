import { createClient } from "@/utils/supabase/server";
import { TeamPage } from "@/features/team";
import type { Profile } from "@/features/team/types";
import { requireViewerPermission } from "@/features/access/server";

export default async function UsersManagement() {
  await requireViewerPermission("users", "view");
  const supabase = await createClient();

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
