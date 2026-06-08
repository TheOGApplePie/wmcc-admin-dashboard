"use client";
import Image from "next/image";
import { ScheduledPost } from "@/app/schemas/postScheduling";

interface PostPreviewProps {
  post: Partial<ScheduledPost> & {
    caption?: string | null;
    hashtags?: string[];
    banner_image_url?: string | null;
    whatsapp_text?: string | null;
  };
}

function InstagramPreview({ post }: PostPreviewProps) {
  const caption = post.caption ?? "";
  const hashtags = (post.hashtags ?? []).map((h) => `#${h}`).join(" ");
  const imageUrl = post.banner_image_url;

  return (
    <div className="w-72 rounded-xl overflow-hidden border border-base-300 bg-white text-black shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600" />
        <div>
          <p className="text-xs font-semibold leading-none">wmcc_mississauga</p>
          <p className="text-[10px] text-gray-400">Sponsored</p>
        </div>
        <span className="ml-auto text-gray-400 text-lg">···</span>
      </div>

      {/* Image */}
      <div className="relative w-full aspect-square bg-gray-100">
        {imageUrl ? (
          <Image src={imageUrl} alt="Post banner" fill className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
            No image
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 px-3 py-2 text-xl">
        <span>♡</span>
        <span>💬</span>
        <span>✈</span>
        <span className="ml-auto">🔖</span>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3 text-xs leading-relaxed">
        {caption && (
          <p>
            <span className="font-semibold">wmcc_mississauga </span>
            {caption}
          </p>
        )}
        {hashtags && <p className="text-blue-500 mt-1">{hashtags}</p>}
        {!caption && !hashtags && (
          <p className="text-gray-300 italic">No caption</p>
        )}
      </div>
    </div>
  );
}

function WhatsAppPreview({ post }: PostPreviewProps) {
  const text = post.whatsapp_text;

  return (
    <div className="w-72 rounded-xl overflow-hidden border border-base-300 bg-[#0b141a] shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#202c33]">
        <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
          W
        </div>
        <div>
          <p className="text-xs font-semibold text-white leading-none">WMCC Announcements</p>
          <p className="text-[10px] text-gray-400">Online</p>
        </div>
      </div>

      {/* Chat area */}
      <div className="px-3 py-4 min-h-24 flex flex-col gap-2">
        {text ? (
          <div className="self-end max-w-[85%] bg-[#005c4b] text-white text-xs rounded-lg rounded-br-sm px-3 py-2 leading-relaxed whitespace-pre-wrap break-words">
            {text}
            <span className="block text-right text-[10px] text-green-300 mt-1">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
            </span>
          </div>
        ) : (
          <p className="text-gray-500 text-xs italic text-center mt-4">No WhatsApp text</p>
        )}
      </div>
    </div>
  );
}

export default function PostPreview({ post }: PostPreviewProps) {
  const hasInstagram =
    post.platforms?.some((p) =>
      ["instagram_feed", "instagram_story"].includes(p),
    ) ?? true;
  const hasWhatsApp = post.platforms?.includes("whatsapp") ?? true;

  if (!hasInstagram && !hasWhatsApp) {
    return (
      <div className="text-sm text-base-content/50 italic text-center py-8">
        No preview available for selected platforms.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-6 justify-center py-4">
      {hasInstagram && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-semibold opacity-60">Instagram</span>
          <InstagramPreview post={post} />
        </div>
      )}
      {hasWhatsApp && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-semibold opacity-60">WhatsApp</span>
          <WhatsAppPreview post={post} />
        </div>
      )}
    </div>
  );
}
