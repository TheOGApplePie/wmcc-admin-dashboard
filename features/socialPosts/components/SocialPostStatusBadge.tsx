import { SocialPostStatus, STATUS_COLORS } from "@/app/schemas/socialPosts";

const STATUS_LABELS: Record<SocialPostStatus, string> = {
  idea: "Idea",
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

export default function SocialPostStatusBadge({ status }: { status: SocialPostStatus }) {
  const { bg, text } = STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
