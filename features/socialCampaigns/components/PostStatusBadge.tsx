import type { SocialPostStatus } from "@/app/schemas/socialCampaigns";
import { postStatusLabel } from "../lib/postApproval";

export default function PostStatusBadge({ status, needsReview = false, className = "" }: Readonly<{
  status: SocialPostStatus;
  needsReview?: boolean;
  className?: string;
}>) {
  const attention = needsReview || ["proposed", "failed", "skipped"].includes(status);
  const color = status === "sent" ? "#16a34a"
    : attention ? "#eab308"
    : ["draft", "cancelled"].includes(status) ? "#9ca3af" : "#2563eb";
  const label = `${postStatusLabel(status)}${needsReview ? " · Needs attention" : ""}`;
  return (
    <span role="img" aria-label={label} title={label}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/15 ${className}`}
      style={{ backgroundColor: color }} />
  );
}
