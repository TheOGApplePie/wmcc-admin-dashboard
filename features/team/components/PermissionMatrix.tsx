"use client";

import { Icon } from "@/app/components/ui/Icon";
import {
  PERMISSION_MODULES,
  type MemberRole,
  type PermissionMap,
  presetPerms,
} from "@/features/team/permissions";

interface PermissionMatrixProps {
  role: MemberRole;
  perms: PermissionMap;
  readOnly: boolean;
  onToggle: (module: string, action: string) => void;
}

function Toggle({
  on,
  onClick,
  disabled,
}: Readonly<{ on: boolean; onClick: () => void; disabled: boolean }>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? "bg-teal" : "bg-stone-300"
      } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function PermissionMatrix({
  role,
  perms,
  readOnly,
  onToggle,
}: Readonly<PermissionMatrixProps>) {
  const preset = presetPerms(role);

  return (
    <div className="space-y-3">
      {PERMISSION_MODULES.map((mod) => (
        <div key={mod.key} className="overflow-hidden rounded-xl border border-line">
          {/* Module header */}
          <div className="flex items-center gap-2 border-b border-line bg-canvas/50 px-3 py-2">
            <Icon d={mod.icon} size={16} className="text-teal shrink-0" />
            <span className="text-[12px] font-bold text-ink">{mod.label}</span>
          </div>

          {/* Actions */}
          <div className="divide-y divide-line">
            {mod.actions.map((act) => {
              const key = `${mod.key}.${act.key}`;
              const on = perms[key] ?? false;
              const changed = preset[key] !== on;

              return (
                <div key={act.key} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-[12.5px] text-ink">{act.label}</span>

                  {act.sensitive && (
                    <span className="rounded-full bg-coral-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-coral">
                      Sensitive
                    </span>
                  )}

                  {changed && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-violet">
                      Custom
                    </span>
                  )}

                  <Toggle
                    on={on}
                    disabled={readOnly}
                    onClick={() => onToggle(mod.key, act.key)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
