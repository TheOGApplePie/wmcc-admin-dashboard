"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getInitialCampaignDefaults } from "@/actions/socialCampaigns";
import type { PlatformDefaults, SocialPostChannel } from "@/app/schemas/socialCampaigns";
import StorageMediaPicker from "@/app/components/ui/StorageMediaPicker";

export default function PlatformDefaultFields({ value, eventId, channels, onChange, onCopy, onReady }: Readonly<{
  value: PlatformDefaults | undefined;
  eventId: number | null;
  channels: SocialPostChannel[];
  onChange: (value: PlatformDefaults, initialized?: boolean) => void;
  onReady: (ready: boolean) => void;
  onCopy?: (platform: keyof PlatformDefaults) => void;
}>) {
  const [picker, setPicker] = useState<keyof PlatformDefaults | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const initialized = value !== undefined && Object.keys(value).length > 0;
  useEffect(() => {
    if (initialized) return;
    let cancelled = false;
    getInitialCampaignDefaults({ event_id: eventId }).then(result => {
      if (cancelled) return;
      if (result?.data) { setError(""); onChange(result.data, true); onReady(true); }
      else setError(result?.serverError || "Could not initialize defaults. Retry before saving.");
    }).catch(() => { if (!cancelled) setError("Could not initialize defaults. Retry before saving."); });
    return () => { cancelled = true; };
  }, [eventId, initialized, onChange, onReady, retry]);
  const platforms = (["instagram", "whatsapp", "tiktok"] as const).filter(platform => channels.some(channel => channel.startsWith(platform)));
  return <div className="space-y-4 md:col-span-2">
    <p className="text-sm text-muted">Platform defaults apply to every new post type. Existing posts change only when you choose Copy to posts. Custom defaults are retained when you change the linked event. Approval is always separate. Reels still require a video before approval.</p>
    {!initialized && <p role="status">Loading event poster and message…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setError(""); setRetry(current => current + 1); }}>Retry</button></p>}
    {initialized && platforms.map(platform => {
      const content = value[platform] ?? {message:"",poster:null};
      const label = platform === "instagram" ? "Instagram" : platform === "whatsapp" ? "WhatsApp" : "TikTok";
      return <fieldset key={platform} className="space-y-3 rounded-xl border border-line p-4">
        <legend className="px-1 font-semibold">{label} default</legend>
        <label className="flex flex-col gap-1 text-sm">Message<textarea rows={4} maxLength={2200} value={content.message} onChange={event => onChange({...value,[platform]:{...content,message:event.target.value}})} className="rounded-lg border border-line p-2" /></label>
        <div className="space-y-2">
          <p className="text-sm">Poster</p>
          <div className="flex items-center gap-4">
            {content.poster ? (
              <div className="relative h-40 w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-canvas">
                <Image src={content.poster.url} alt={content.poster.alt_text || `${label} default poster`} fill sizes="112px" className="object-contain" />
              </div>
            ) : (
              <div className="grid h-40 w-28 shrink-0 place-items-center rounded-lg border border-dashed border-line bg-canvas p-3 text-center text-xs text-muted">No poster selected</div>
            )}
            <div className="flex flex-col items-start gap-2">
              <button type="button" onClick={() => setPicker(platform)} aria-label={`${content.poster ? "Change" : "Choose"} ${label} poster`} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">{content.poster ? "Change" : "Choose poster"}</button>
              {content.poster && <button type="button" onClick={() => onChange({...value,[platform]:{...content,poster:null}})} aria-label={`Remove ${label} poster`} className="text-sm text-red-700 underline">Remove</button>}
            </div>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">Poster alt text<input maxLength={1000} disabled={!content.poster} value={content.poster?.alt_text ?? ""} onChange={event => onChange({...value,[platform]:{...content,poster:content.poster ? {...content.poster,alt_text:event.target.value}:null}})} className="rounded-lg border border-line p-2" /></label>
        {onCopy && <button type="button" onClick={() => onCopy(platform)} className="text-sm underline">Copy to posts…</button>}
      </fieldset>;
    })}
    {picker && <StorageMediaPicker context="social" selectedUrls={value?.[picker]?.poster ? [value[picker]!.poster!.url] : []} maximum={1} mediaKind="image" whatsappPoster={picker === "whatsapp"}
      onChange={urls => { const content = value?.[picker] ?? {message:"",poster:null}; onChange({...value,[picker]:{...content,poster:urls[0] ? {url:urls[0],alt_text:content.poster?.alt_text ?? ""}:null}}); }} onClose={() => setPicker(null)} />}
  </div>;
}
