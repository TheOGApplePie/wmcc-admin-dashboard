"use client";

import { useState, useEffect } from "react";
import { SocialChannel, CHANNEL_LABELS } from "@/app/schemas/socialPosts";

// ─── IG Feed preview ──────────────────────────────────────────────────────────

function IgFeedPreview({ caption, mediaUrl }: { caption: string; mediaUrl: string | null }) {
  return (
    <div className="flex flex-col rounded-xl overflow-hidden border" style={{ borderColor: "#E7E3DA", maxWidth: 320, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: "#fff" }}>
        <div className="rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ width: 28, height: 28, background: "linear-gradient(135deg, #C13584, #E0A53C)" }}>W</div>
        <div>
          <div className="text-[12px] font-semibold" style={{ color: "#15201C" }}>wmcc.ca</div>
        </div>
        <div className="ml-auto text-[12px] font-semibold" style={{ color: "#0F8073" }}>Follow</div>
      </div>

      {/* Media */}
      <div className="w-full" style={{ aspectRatio: "1/1", backgroundColor: "#E7E3DA" }}>
        {mediaUrl ? (
          <img src={mediaUrl} alt="Post media" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6B726E" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-[11px]" style={{ color: "#6B726E" }}>No media</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 px-3 pt-2" style={{ backgroundColor: "#fff" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15201C" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15201C" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15201C" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
      </div>

      {/* Caption */}
      <div className="px-3 pt-1.5 pb-3" style={{ backgroundColor: "#fff" }}>
        {caption ? (
          <p className="text-[11px] line-clamp-3" style={{ color: "#15201C" }}>
            <span className="font-semibold">wmcc.ca </span>
            {caption}
          </p>
        ) : (
          <p className="text-[11px] italic" style={{ color: "#6B726E" }}>Caption will appear here…</p>
        )}
      </div>
    </div>
  );
}

// ─── IG Story preview ─────────────────────────────────────────────────────────

function IgStoryPreview({ caption, mediaUrl }: { caption: string; mediaUrl: string | null }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden flex flex-col"
      style={{
        aspectRatio: "9/16",
        maxWidth: 180,
        margin: "0 auto",
        background: mediaUrl ? "transparent" : "linear-gradient(160deg, #1e3a5f 0%, #08101a 100%)",
      }}
    >
      {mediaUrl && (
        <img src={mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {/* Overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.3) 0%, transparent 30%, transparent 60%, rgba(0,0,0,.5) 100%)" }} />

      {/* Progress bars */}
      <div className="relative flex gap-1 p-2 pt-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-0.5 rounded-full flex-1" style={{ backgroundColor: i === 0 ? "#fff" : "rgba(255,255,255,.4)" }} />
        ))}
      </div>

      {/* Avatar + handle */}
      <div className="relative flex items-center gap-1.5 px-2 pb-1">
        <div className="rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ width: 20, height: 20, background: "linear-gradient(135deg, #C13584, #E0A53C)" }}>W</div>
        <span className="text-white text-[10px] font-semibold">wmcc.ca</span>
      </div>

      {/* Media placeholder if no media */}
      {!mediaUrl && (
        <div className="relative flex-1 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}
      {mediaUrl && <div className="relative flex-1" />}

      {/* Caption */}
      <div className="relative px-2 pb-1">
        {caption && (
          <p className="text-white text-[9px] line-clamp-2 font-medium mb-2">{caption}</p>
        )}
        {/* Send message pill */}
        <div className="rounded-full border border-white/60 flex items-center justify-center py-1 text-white text-[9px]">
          Send message
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp preview ─────────────────────────────────────────────────────────

function WhatsAppPreview({ caption, mediaUrl }: { caption: string; mediaUrl: string | null }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ maxWidth: 300, margin: "0 auto", backgroundColor: "#ECE5DD" }}
    >
      {/* Broadcast header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ backgroundColor: "#075E54" }}
      >
        <div className="rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ width: 32, height: 32, backgroundColor: "#128C7E" }}>W</div>
        <div>
          <div className="text-white text-[13px] font-semibold">WMCC Broadcast</div>
          <div className="text-white/70 text-[11px]">Broadcast list</div>
        </div>
      </div>

      {/* Chat area */}
      <div className="p-4">
        <div
          className="rounded-xl rounded-tl-none overflow-hidden"
          style={{ backgroundColor: "#fff", maxWidth: "85%" }}
        >
          {mediaUrl && (
            <div style={{ aspectRatio: "4/3" }}>
              <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="px-3 py-2">
            {caption ? (
              <p className="text-[12px]" style={{ color: "#15201C" }}>{caption}</p>
            ) : (
              <p className="text-[12px] italic" style={{ color: "#6B726E" }}>Caption will appear here…</p>
            )}
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[10px]" style={{ color: "#6B726E" }}>{timeStr}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25A565" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
                <polyline points="20 6 15 17 9 12" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preview switcher ─────────────────────────────────────────────────────────

interface PostPreviewProps {
  channels: SocialChannel[];
  caption: string;
  mediaUrl: string | null;
}

export default function PostPreview({ channels, caption, mediaUrl }: PostPreviewProps) {
  const [activeChannel, setActiveChannel] = useState<SocialChannel | null>(null);

  useEffect(() => {
    if (channels.length === 0) {
      setActiveChannel(null);
    } else if (!channels.includes(activeChannel as SocialChannel)) {
      setActiveChannel(channels[0]);
    }
  }, [channels, activeChannel]);

  if (channels.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-12 text-center"
        style={{ backgroundColor: "#F6F4EF", border: "1.5px dashed #E7E3DA" }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6B726E" strokeWidth="1.5" className="mb-2 opacity-50">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-[13px]" style={{ color: "#6B726E" }}>Select a channel to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tab switcher — shown when multiple channels are selected */}
      {channels.length > 1 && (
        <div className="flex gap-1">
          {channels.map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
              style={
                activeChannel === ch
                  ? { backgroundColor: "#0F8073", color: "#fff" }
                  : { backgroundColor: "#E7E3DA", color: "#6B726E" }
              }
            >
              {CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>
      )}

      {/* Preview */}
      {(activeChannel ?? channels[0]) === "ig_feed" && (
        <IgFeedPreview caption={caption} mediaUrl={mediaUrl} />
      )}
      {(activeChannel ?? channels[0]) === "ig_story" && (
        <IgStoryPreview caption={caption} mediaUrl={mediaUrl} />
      )}
      {(activeChannel ?? channels[0]) === "whatsapp" && (
        <WhatsAppPreview caption={caption} mediaUrl={mediaUrl} />
      )}
    </div>
  );
}
