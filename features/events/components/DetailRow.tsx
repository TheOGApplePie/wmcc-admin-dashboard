export function DetailRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <dl>
      <dt className="mb-0.5 text-caption text-muted">{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}
