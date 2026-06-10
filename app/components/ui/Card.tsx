import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  noPad?: boolean;
}

export function Card({ noPad, className, children, ...props }: Readonly<CardProps>) {
  return (
    <div
      className={`bg-surface border border-line rounded-2xl shadow-[0_2px_12px_-4px_rgba(21,32,28,.08)] ${noPad ? "" : "p-5"} ${className ?? ""}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeadProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function CardHead({ title, subtitle, action }: Readonly<CardHeadProps>) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-[12px] text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
