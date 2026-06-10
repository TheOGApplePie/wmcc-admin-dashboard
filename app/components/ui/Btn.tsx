import type { ButtonHTMLAttributes } from "react";

type BtnVariant = "primary" | "ghost" | "soft" | "danger" | "dark" | "outline";
type BtnSize = "sm" | "md" | "lg";

const VARIANTS: Record<BtnVariant, string> = {
  primary: "bg-teal hover:bg-teal-dark text-white shadow-[0_8px_18px_-8px_rgba(15,128,115,.8)]",
  ghost:   "bg-transparent hover:bg-teal-soft text-muted hover:text-ink",
  soft:    "bg-teal-soft hover:bg-teal/20 text-teal-dark",
  danger:  "bg-coral-soft hover:bg-coral/20 text-coral",
  dark:    "bg-ink hover:bg-ink/80 text-white",
  outline: "bg-transparent border border-line hover:border-teal text-ink hover:text-teal",
};

const SIZES: Record<BtnSize, string> = {
  sm: "px-3 py-1.5 text-[12px] gap-1.5",
  md: "px-4 py-2 text-[13px] gap-2",
  lg: "px-5 py-2.5 text-[14px] gap-2",
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
}

export function Btn({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Readonly<BtnProps>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl font-semibold transition-colors active:scale-[.98] ${VARIANTS[variant]} ${SIZES[size]} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
