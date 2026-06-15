import type { MemberRole, MemberStatus, PermissionOverrides } from "./permissions";

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  avatar_path: string | null;
  role: MemberRole;
  status: MemberStatus;
  area: string | null;
  permission_overrides: PermissionOverrides;
  notification_prefs: Record<string, boolean>;
  last_active_at: string | null;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
}
