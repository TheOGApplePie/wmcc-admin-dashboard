import { Sparkline } from "./Sparkline";

interface StatDelta {
  label: string;
  positive: boolean;
}

interface StatProps {
  label: string;
  value: string | number;
  delta?: StatDelta | null;
  sparkline?: number[];
  accentColor?: string;
}

export function Stat({
  label,
  value,
  delta,
  sparkline,
  accentColor = "#0F8073",
}: Readonly<StatProps>) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12px] text-muted mb-1 truncate">{label}</p>
        <p className="text-[26px] font-extrabold tracking-tight leading-none">
          {value}
        </p>
        {delta && (
          <p
            className="text-[11px] font-medium mt-1"
            style={{ color: delta.positive ? "#0F8073" : "#DC6B62" }}
          >
            {delta.positive ? "↑" : "↓"} {delta.label}
          </p>
        )}
      </div>
      {sparkline && (
        <div className="shrink-0 opacity-70">
          <Sparkline values={sparkline} color={accentColor} />
        </div>
      )}
    </div>
  );
}
