import type { MemberRole, MemberStatus, PermissionMap } from "@/features/team/permissions";

export interface ViewerProfile {
  id: string;
  displayName: string;
  role: MemberRole;
  status: MemberStatus;
}

export interface ViewerAccess {
  profile: ViewerProfile | null;
  permissions: PermissionMap;
}
