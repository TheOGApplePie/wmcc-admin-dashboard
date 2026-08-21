import { createClient } from "@/utils/supabase/server";
import { TeamPage } from "@/features/team";
import type { Profile } from "@/features/team/types";
import { requirePermission } from "@/features/access/server";

type SafeRosterProfile = Omit<
  Profile,
  "email" | "permission_overrides" | "notification_prefs" | "invited_by"
>;

export default async function UsersManagement() {
  const supabase = await createClient();

  const access = await requirePermission("users", "view");
  const isBoard = access.profile?.role === "board";

  let visibleProfiles: Profile[];
  if (isBoard) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("role")
      .order("display_name")
      .overrideTypes<Profile[]>();
    if (error) throw new Error(error.message);
    visibleProfiles = data ?? [];
  } else {
    const { data, error } = await supabase.rpc("get_team_roster");
    if (error) throw new Error(error.message);
    visibleProfiles = (data ?? []).map((profile: SafeRosterProfile) => ({
      ...profile,
      email: "Hidden — Board access required",
      permission_overrides: {},
      notification_prefs: {},
      invited_by: null,
    })) as Profile[];
  }

  return (
    <TeamPage
      profiles={visibleProfiles}
      currentUserId={access.profile?.id ?? null}
    />
  );
}
