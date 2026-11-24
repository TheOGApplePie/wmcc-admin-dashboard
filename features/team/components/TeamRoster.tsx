"use client";

import Link from "next/link";
import { Avatar } from "@/app/components/ui/Avatar";
import { Icon } from "@/app/components/ui/Icon";
import {
  ROLE_LABELS,
  ROLE_COLOURS,
  isCustom,
  type MemberRole,
} from "@/features/team/permissions";
import type { Profile } from "@/features/team/types";

interface TeamRosterProps {
  members: Profile[];
  query: string;
  page: number;
  total: number;
  selectedId: string | null;
  currentUserId: string | null;
  onSelect: (id: string) => void;
}

function RoleBadge({ role }: Readonly<{ role: MemberRole }>) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        background: ROLE_COLOURS[role] + "1a",
        color: ROLE_COLOURS[role],
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: ROLE_COLOURS[role] }}
      />
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusPill({ status }: Readonly<{ status: Profile["status"] }>) {
  if (status === "active")
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-teal-dark">
        <span className="h-1.5 w-1.5 rounded-full bg-teal" />
        Active
      </span>
    );
  if (status === "invited")
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-medium"
        style={{ color: "#9a6e16" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber" />
        Invited
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-stone-400">
      <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
      Inactive
    </span>
  );
}

export function TeamRoster({
  members,
  query,
  page,
  total,
  selectedId,
  currentUserId,
  onSelect,
}: Readonly<TeamRosterProps>) {
  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <form
        method="get"
        className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-muted focus-within:border-teal transition-colors"
      >
        <Icon
          d="M21 21l-4.3-4.3 M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"
          size={15}
          className="shrink-0"
        />
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search team…"
          className="w-full bg-transparent text-ink outline-none placeholder:text-muted"
        />
        <button type="submit" className="text-xs font-semibold">
          Search
        </button>
      </form>

      {/* List */}
      <div className="-mr-2 flex-1 space-y-2 overflow-y-auto pr-2">
        {members.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted">
            No members found.
          </p>
        )}
        {members.map((m) => {
          const on = m.id === selectedId;
          const hasCustom = isCustom(m.role, m.permission_overrides);

          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                on
                  ? "border-teal bg-teal-soft/40 shadow-sm"
                  : "border-line bg-surface hover:border-stone-300"
              } ${m.status === "inactive" ? "opacity-60" : ""}`}
            >
              <Avatar name={m.display_name} size={40} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-bold text-ink">
                    {m.display_name}
                  </span>
                  {m.id === currentUserId && (
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-stone-500">
                      You
                    </span>
                  )}
                </div>
                {m.area && (
                  <div className="truncate text-[11.5px] text-muted">
                    {m.area}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <RoleBadge role={m.role} />
                  {hasCustom && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-violet">
                      Custom
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill status={m.status} />
              </div>
            </button>
          );
        })}
      </div>
      <nav
        aria-label="Team pages"
        className="mt-3 flex justify-between text-sm"
      >
        {page > 1 ? (
          <Link href={`?q=${encodeURIComponent(query)}&page=${page - 1}`}>
            Previous
          </Link>
        ) : (
          <span />
        )}
        {page * 50 < total && (
          <Link href={`?q=${encodeURIComponent(query)}&page=${page + 1}`}>
            Next
          </Link>
        )}
      </nav>
    </div>
  );
}
