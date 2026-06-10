type BadgeVariant = "teal" | "amber" | "violet" | "coral" | "muted" | "ink";

const BADGE_STYLES: Record<BadgeVariant, { bg: string; text: string }> = {
  teal:   { bg: "#E4F2EF", text: "#0B6359" },
  amber:  { bg: "#FBF0DA", text: "#9a6e16" },
  violet: { bg: "#EDEBFA", text: "#5545b8" },
  coral:  { bg: "#FBE7E5", text: "#a8443c" },
  muted:  { bg: "#F0EFED", text: "#6B726E" },
  ink:    { bg: "#15201C", text: "#ffffff" },
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  variant = "muted",
  children,
  className,
}: Readonly<BadgeProps>) {
  const styles = BADGE_STYLES[variant];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${className ?? ""}`}
      style={{ backgroundColor: styles.bg, color: styles.text }}
    >
      {children}
    </span>
  );
}
