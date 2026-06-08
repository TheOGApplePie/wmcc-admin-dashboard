import { PostStatus } from "@/app/schemas/postScheduling";

const CONFIG: Record<PostStatus, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "badge-ghost" },
  scheduled: { label: "Scheduled", className: "badge-warning" },
  posted:    { label: "Posted",    className: "badge-success" },
  failed:    { label: "Failed",    className: "badge-error" },
};

export default function PostStatusBadge({ status }: { status: PostStatus }) {
  const { label, className } = CONFIG[status];
  return <span className={`badge ${className} badge-sm`}>{label}</span>;
}
