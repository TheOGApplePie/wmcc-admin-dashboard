// Shared permission model for the Team module.
//
// Single source of truth for role presets and the module × action matrix,
// used by both the server (action guards) and the client (permission editor).
// The SQL function has_perm() in supabase/migrations/010_team_profiles.sql
// mirrors these presets — keep the two in sync.

export type MemberRole = "board" | "management" | "volunteer";
export type MemberStatus = "invited" | "active" | "inactive";

/** Flat map of "<module>.<action>": granted? */
export type PermissionMap = Record<string, boolean>;
/** Per-user deviations from the role preset, e.g. { "social.send": true }. */
export type PermissionOverrides = Record<string, boolean>;

export interface ModuleAction {
  key: string;
  label: string;
  /** A mistake here is public, irreversible, or destructive — surface it. */
  sensitive?: boolean;
}

export interface PermissionModule {
  key: string;
  label: string;
  icon: string; // path data for app/components/ui/Icon
  actions: ModuleAction[];
}

export const ROLES: MemberRole[] = ["board", "management", "volunteer"];

export const ROLE_LABELS: Record<MemberRole, string> = {
  board: "Board of Director",
  management: "Management",
  volunteer: "Volunteer",
};

export const ROLE_COLOURS: Record<MemberRole, string> = {
  board: "#7A6CD6",
  management: "#0F8073",
  volunteer: "#3E8EDC",
};

export const ROLE_BLURBS: Record<MemberRole, string> = {
  board: "Full access, including the team and integrations.",
  management: "Runs day-to-day content and publishing. Sees the team, can't change it.",
  volunteer: "Drafts and views content. Can't publish, delete, or manage people.",
};

const ICONS = {
  megaphone: "M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z M18 8a4 4 0 0 1 0 8",
  calendar: "M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  send: "M22 2 11 13 M22 2l-7 20-4-9-9-4Z",
  feedback: "M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  sync: "M21 12a9 9 0 0 1-15 6.7L3 16 M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M3 21v-5h5",
};

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: "announcements",
    label: "Announcements",
    icon: ICONS.megaphone,
    actions: [
      { key: "view", label: "View" },
      { key: "edit", label: "Create / Update" },
      { key: "publish", label: "Publish (go live)", sensitive: true },
      { key: "delete", label: "Delete", sensitive: true },
    ],
  },
  {
    key: "events",
    label: "Events",
    icon: ICONS.calendar,
    actions: [
      { key: "view", label: "View" },
      { key: "edit", label: "Create / Update" },
      { key: "publish", label: "Publish (go live)", sensitive: true },
      { key: "delete", label: "Delete", sensitive: true },
    ],
  },
  {
    key: "social",
    label: "Social Posts",
    icon: ICONS.send,
    actions: [
      { key: "view", label: "View" },
      { key: "edit", label: "Create / Update" },
      { key: "send", label: "Send / Broadcast", sensitive: true },
      { key: "delete", label: "Delete", sensitive: true },
    ],
  },
  {
    key: "feedback",
    label: "Community Feedback",
    icon: ICONS.feedback,
    actions: [
      { key: "view", label: "View" },
      { key: "respond", label: "Respond", sensitive: true },
    ],
  },
  {
    key: "users",
    label: "Users / Team",
    icon: ICONS.users,
    actions: [
      { key: "view", label: "View roster" },
      { key: "manage", label: "Create / Update", sensitive: true },
      { key: "delete", label: "Delete / Deactivate", sensitive: true },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    icon: ICONS.sync,
    actions: [{ key: "manage", label: "Manage", sensitive: true }],
  },
];

// Role presets: which actions each role's preset grants. Board = everything.
const PRESETS: Record<Exclude<MemberRole, "board">, Record<string, string[]>> = {
  management: {
    announcements: ["view", "edit", "publish", "delete"],
    events: ["view", "edit", "publish", "delete"],
    social: ["view", "edit", "send", "delete"],
    feedback: ["view", "respond"],
    users: ["view"],
    integrations: [],
  },
  volunteer: {
    announcements: ["view", "edit"],
    events: ["view", "edit"],
    social: ["view", "edit"],
    feedback: ["view"],
    users: [],
    integrations: [],
  },
};

/** The full flat permission map a role's preset grants. */
export function presetPerms(role: MemberRole): PermissionMap {
  const out: PermissionMap = {};
  for (const mod of PERMISSION_MODULES) {
    for (const action of mod.actions) {
      const granted =
        role === "board" || (PRESETS[role][mod.key] ?? []).includes(action.key);
      out[`${mod.key}.${action.key}`] = granted;
    }
  }
  return out;
}

/** Preset with per-user overrides applied on top. */
export function effectivePerms(
  role: MemberRole,
  overrides: PermissionOverrides | null | undefined,
): PermissionMap {
  const out = presetPerms(role);
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (key in out) out[key] = value;
  }
  return out;
}

/** "Custom" = the effective set deviates from the clean preset. */
export function isCustom(
  role: MemberRole,
  overrides: PermissionOverrides | null | undefined,
): boolean {
  const base = presetPerms(role);
  return Object.entries(overrides ?? {}).some(
    ([key, value]) => key in base && base[key] !== value,
  );
}

/** Does a member (role + overrides) have "<module>.<action>"? */
export function hasPerm(
  role: MemberRole,
  overrides: PermissionOverrides | null | undefined,
  module: string,
  action: string,
): boolean {
  return effectivePerms(role, overrides)[`${module}.${action}`] ?? false;
}

/**
 * Diff an edited permission map against a role's preset, producing the minimal
 * overrides object to store (entries equal to the preset are dropped).
 */
export function permsToOverrides(
  role: MemberRole,
  perms: PermissionMap,
): PermissionOverrides {
  const base = presetPerms(role);
  const out: PermissionOverrides = {};
  for (const [key, value] of Object.entries(perms)) {
    if (key in base && base[key] !== value) out[key] = value;
  }
  return out;
}
