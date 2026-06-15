"use client";

import { useState } from "react";
import { PageShell } from "@/app/components/ui/PageShell";
import { Icon } from "@/app/components/ui/Icon";
import { Btn } from "@/app/components/ui/Btn";
import { hasPerm } from "@/features/team/permissions";
import type { Profile } from "@/features/team/types";
import { TeamRoster } from "./components/TeamRoster";
import { MemberInspector } from "./components/MemberInspector";
import { InviteModal } from "./components/InviteModal";

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  value,
  label,
  color,
}: Readonly<{ icon: string; value: number; label: string; color: string }>) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-[0_2px_12px_-4px_rgba(21,32,28,.08)]">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: color + "1a", color }}
      >
        <Icon d={icon} size={19} />
      </span>
      <div>
        <div className="text-[20px] font-extrabold tabular-nums text-ink">{value}</div>
        <div className="text-[11px] text-muted">{label}</div>
      </div>
    </div>
  );
}

// ── TeamPage ──────────────────────────────────────────────────────────────────

interface TeamPageProps {
  profiles: Profile[];
  currentUserId: string | null;
}

export function TeamPage({ profiles, currentUserId }: Readonly<TeamPageProps>) {
  const [selectedId, setSelectedId] = useState<string | null>(
    profiles[0]?.id ?? null,
  );
  const [showInvite, setShowInvite] = useState(false);

  const currentProfile = profiles.find((p) => p.id === currentUserId) ?? null;
  const viewerCanManage = currentProfile
    ? hasPerm(currentProfile.role, currentProfile.permission_overrides, "users", "manage")
    : false;

  const selectedMember = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null;

  // Stats
  const activeCount = profiles.filter((p) => p.status === "active").length;
  const boardCount = profiles.filter((p) => p.role === "board").length;
  const mgmtCount = profiles.filter((p) => p.role === "management").length;
  const invitedCount = profiles.filter((p) => p.status === "invited").length;

  const ICONS = {
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    star: "M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17.8 6.6 19.6l1-6L3.3 9.4l6-.9Z",
    check: "M20 6 9 17l-5-5",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2",
  };

  return (
    <>
      <PageShell
        title="Team"
        subtitle="Manage who has access and what they can do"
        actions={
          viewerCanManage ? (
            <Btn variant="primary" size="md" onClick={() => setShowInvite(true)}>
              <Icon d="M12 5v14M5 12h14" size={15} />
              Invite member
            </Btn>
          ) : undefined
        }
      >
        {/* Stats strip */}
        <div className="mb-5 grid grid-cols-4 gap-3">
          <StatCard icon={ICONS.users} value={activeCount} label="Active members" color="#0F8073" />
          <StatCard icon={ICONS.star} value={boardCount} label="Board of Director" color="#7A6CD6" />
          <StatCard icon={ICONS.check} value={mgmtCount} label="Management" color="#0F8073" />
          <StatCard icon={ICONS.clock} value={invitedCount} label="Pending invites" color="#E0A53C" />
        </div>

        {/* Two-pane layout */}
        <div className="grid grid-cols-5 gap-5" style={{ height: "calc(100vh - 230px)" }}>
          {/* Roster — 2/5 */}
          <div className="col-span-2 flex flex-col overflow-hidden">
            <TeamRoster
              members={profiles}
              selectedId={selectedId}
              currentUserId={currentUserId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Inspector — 3/5 */}
          <div className="col-span-3 overflow-hidden">
            {selectedMember ? (
              <MemberInspector
                key={selectedMember.id}
                member={selectedMember}
                currentUserId={currentUserId}
                viewerCanManage={viewerCanManage}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-line bg-surface text-center text-muted">
                <div>
                  <Icon
                    d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"
                    size={32}
                    className="mx-auto text-stone-300"
                  />
                  <p className="mt-2 text-[13px]">Select a team member to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageShell>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </>
  );
}
