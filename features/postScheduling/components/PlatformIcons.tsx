import { PlatformType } from "@/app/schemas/postScheduling";

const LABELS: Record<PlatformType, string> = {
  instagram_feed:  "IG Feed",
  instagram_story: "IG Story",
  whatsapp:        "WA",
};

const COLORS: Record<PlatformType, string> = {
  instagram_feed:  "bg-pink-500",
  instagram_story: "bg-purple-500",
  whatsapp:        "bg-green-500",
};

export default function PlatformIcons({ platforms }: { platforms: PlatformType[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {platforms.map((p) => (
        <span
          key={p}
          className={`${COLORS[p]} text-white text-xs px-1.5 py-0.5 rounded font-medium`}
        >
          {LABELS[p]}
        </span>
      ))}
    </div>
  );
}
