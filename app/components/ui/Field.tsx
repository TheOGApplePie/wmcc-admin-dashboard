export const INPUT =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-teal transition-colors placeholder:text-muted";

export function Field({
  label,
  error,
  hint,
  children,
}: Readonly<{ label: string; error?: string; hint?: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] font-semibold text-ink">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted leading-snug">{hint}</p>}
      {error && <p className="text-[11px] text-coral">{error}</p>}
    </div>
  );
}
