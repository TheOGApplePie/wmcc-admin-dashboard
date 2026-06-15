"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Avatar } from "@/app/components/ui/Avatar";
import { Btn } from "@/app/components/ui/Btn";
import { Card } from "@/app/components/ui/Card";
import { Icon } from "@/app/components/ui/Icon";
import {
  ROLE_COLOURS,
  ROLE_LABELS,
  ROLE_BLURBS,
  ROLES,
  effectivePerms,
  isCustom,
  permsToOverrides,
  presetPerms,
  type MemberRole,
  type PermissionMap,
} from "@/features/team/permissions";
import type { Profile } from "@/features/team/types";
import {
  updateMember,
  deactivateMember,
  reactivateMember,
  resendInvite,
} from "@/features/team/actions";
import { PermissionMatrix } from "./PermissionMatrix";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusPill({ status }: Readonly<{ status: Profile["status"] }>) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-dark">
        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
        Active
      </span>
    );
  if (status === "invited")
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#9a6e16" }}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber" />
        Invited
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
      Inactive
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface MemberInspectorProps {
  member: Profile;
  currentUserId: string | null;
  viewerCanManage: boolean;
}

export function MemberInspector({
  member,
  currentUserId,
  viewerCanManage,
}: Readonly<MemberInspectorProps>) {
  const isYou = member.id === currentUserId;
  const readOnly = !viewerCanManage || isYou || member.status === "inactive";

  const [role, setRole] = useState<MemberRole>(member.role);
  const [perms, setPerms] = useState<PermissionMap>(() =>
    effectivePerms(member.role, member.permission_overrides),
  );
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const custom = isCustom(role, permsToOverrides(role, perms));

  function pickRole(r: MemberRole) {
    if (readOnly) return;
    setRole(r);
    setPerms(presetPerms(r));
  }

  function togglePerm(mod: string, act: string) {
    setPerms((prev) => ({ ...prev, [`${mod}.${act}`]: !prev[`${mod}.${act}`] }));
  }

  async function handleSave() {
    setSaving(true);
    const overrides = permsToOverrides(role, perms);
    const res = await updateMember({
      id: member.id,
      role,
      area: member.area,
      permission_overrides: overrides,
    });
    setSaving(false);
    if (res?.data?.error) {
      toast.error(res.data.error as string);
    } else if (res?.serverError) {
      toast.error("Something went wrong. Please try again.");
    } else {
      toast.success("Member updated.");
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    const res = await deactivateMember({ id: member.id });
    setDeactivating(false);
    if (res?.data?.error) {
      toast.error(res.data.error as string);
    } else if (res?.serverError) {
      toast.error(res.serverError as string);
    } else {
      toast.success("Member deactivated.");
    }
  }

  async function handleReactivate() {
    setDeactivating(true);
    const res = await reactivateMember({ id: member.id });
    setDeactivating(false);
    if (res?.data?.error) {
      toast.error(res.data.error as string);
    } else if (res?.serverError) {
      toast.error("Something went wrong.");
    } else {
      toast.success("Member reactivated.");
    }
  }

  async function handleResendInvite() {
    setResending(true);
    const res = await resendInvite({ email: member.email });
    setResending(false);
    if (res?.data?.error) {
      toast.error(res.data.error as string);
    } else if (res?.serverError) {
      toast.error("Something went wrong. Please try again.");
    } else {
      toast.success("Invite resent.");
    }
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 border-b border-line pb-4">
        <Avatar name={member.display_name} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-bold text-ink">{member.display_name}</h3>
            {isYou && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                You
              </span>
            )}
          </div>
          <a className="text-[12px] text-teal hover:underline">{member.email}</a>
          <div className="mt-1.5 flex items-center gap-3">
            <StatusPill status={member.status} />
            {member.area && (
              <span className="text-[11px] text-muted">{member.area}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Invited banner ──────────────────────────────────────────────────── */}
      {member.status === "invited" && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-soft px-3 py-2 text-[12px]" style={{ color: "#9a6e16" }}>
          <span className="flex items-center gap-1.5">
            <Icon d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2" size={14} />
            Invite sent {fmtDate(member.created_at)}
          </span>
          <button
            onClick={handleResendInvite}
            disabled={resending}
            className="font-semibold hover:underline disabled:opacity-60"
          >
            {resending ? "Sending…" : "Resend invite"}
          </button>
        </div>
      )}

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="-mr-2 mt-4 flex-1 space-y-4 overflow-y-auto pr-2">
        {/* Role selector */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[12px] font-semibold text-muted">Role</label>
            {custom && viewerCanManage && !isYou && (
              <button
                onClick={() => setPerms(presetPerms(role))}
                className="flex items-center gap-1 text-[11px] font-semibold text-teal hover:text-teal-dark"
              >
                <Icon d="M21 12a9 9 0 0 1-15 6.7L3 16 M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M3 21v-5h5" size={12} />
                Reset to {ROLE_LABELS[role]} preset
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => {
              const on = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => pickRole(r)}
                  disabled={readOnly}
                  className={`rounded-xl border-2 p-2.5 text-left transition-all disabled:cursor-not-allowed ${
                    on
                      ? "border-teal bg-teal-soft/40"
                      : "border-line hover:border-stone-300 disabled:hover:border-line"
                  }`}
                >
                  <span className="block text-[12px] font-bold text-ink">
                    {ROLE_LABELS[r]}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted">
                    {ROLE_BLURBS[r]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[11px]">
            {custom ? (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold"
                style={{ background: "#EDEBFA", color: "#534399" }}
              >
                {ROLE_LABELS[role]} · Custom
              </span>
            ) : (
              <span className="text-muted">
                Using the standard {ROLE_LABELS[role]} preset.
              </span>
            )}
          </div>
        </div>

        {/* Permission matrix */}
        <div>
          <label className="mb-2 block text-[12px] font-semibold text-muted">
            Permissions
            {member.status === "inactive" && (
              <span className="font-normal"> · read-only while inactive</span>
            )}
          </label>
          <PermissionMatrix
            role={role}
            perms={perms}
            readOnly={readOnly}
            onToggle={togglePerm}
          />
        </div>

        {/* Account info */}
        <div className="rounded-xl border border-line p-3 text-[12px]">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted">Joined</span>
            <span className="font-medium text-ink">{fmtDate(member.joined_at)}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted">Last active</span>
            <span className="font-medium text-ink">
              {member.last_active_at ? fmtDate(member.last_active_at) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted">Role colour</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: ROLE_COLOURS[member.role] + "1a",
                color: ROLE_COLOURS[member.role],
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: ROLE_COLOURS[member.role] }}
              />
              {ROLE_LABELS[member.role]}
            </span>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-4">
        {isYou ? (
          <p className="text-[11px] text-muted">You can&apos;t change your own access.</p>
        ) : member.status === "inactive" ? (
          <Btn
            variant="soft"
            size="sm"
            onClick={handleReactivate}
            disabled={deactivating || !viewerCanManage}
          >
            <Icon d="M21 12a9 9 0 0 1-15 6.7L3 16 M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M3 21v-5h5" size={14} />
            {deactivating ? "Reactivating…" : "Reactivate"}
          </Btn>
        ) : (
          <Btn
            variant="danger"
            size="sm"
            onClick={handleDeactivate}
            disabled={deactivating || !viewerCanManage}
          >
            <Icon d="M3 6h18 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" size={14} />
            {deactivating ? "Deactivating…" : "Deactivate"}
          </Btn>
        )}

        {!isYou && member.status !== "inactive" && viewerCanManage && (
          <div className="flex gap-2">
            <Btn
              variant="outline"
              size="sm"
              onClick={() => {
                setRole(member.role);
                setPerms(effectivePerms(member.role, member.permission_overrides));
              }}
            >
              Cancel
            </Btn>
            <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Icon d="M20 6 9 17l-5-5" size={14} />
              )}
              Save changes
            </Btn>
          </div>
        )}
      </div>
    </Card>
  );
}
