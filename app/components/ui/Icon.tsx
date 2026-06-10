import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  d: string;
  size?: number;
}

export function Icon({ d, size = 20, ...props }: Readonly<IconProps>) {
  const parts = d.split(" M");
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {parts.map((part, i) => (
        <path key={part} d={(i ? "M" : "") + part} />
      ))}
    </svg>
  );
}
