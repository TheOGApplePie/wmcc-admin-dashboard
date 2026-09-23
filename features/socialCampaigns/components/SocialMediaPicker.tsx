"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { listSocialStorageMedia } from "@/actions/socialCampaigns";

type Bucket = "event-posters" | "videos";
type MediaKind = "instagram_image" | "video" | "image_or_video";
type StorageEntry = {
  name: string;
  path: string;
  isFolder: boolean;
  mimeType: string | null;
  size: number | null;
  url: string | null;
};

function parentFolder(prefix: string) {
  return prefix.split("/").slice(0, -1).join("/");
}

export default function SocialMediaPicker({ selectedUrls, maximum, mediaKind, onChange, onClose }: Readonly<{
  selectedUrls: string[];
  maximum: number;
  mediaKind: MediaKind;
  onChange: (urls: string[]) => void;
  onClose: () => void;
}>) {
  const [bucket, setBucket] = useState<Bucket>(mediaKind === "video" ? "videos" : "event-posters");
  const [prefix, setPrefix] = useState("");
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [selected, setSelected] = useState(selectedUrls);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    listSocialStorageMedia({ bucket, prefix, offset }).then((result) => {
      if (!active) return;
      setLoading(false);
      setLoadingMore(false);
      if (result?.data?.error) return toast.error(result.data.error);
      const page = result?.data?.data;
      const nextEntries = (page?.entries ?? []) as StorageEntry[];
      setEntries((current) => offset === 0 ? nextEntries : [...current, ...nextEntries]);
      setHasMore(Boolean(page?.hasMore));
    });
    return () => { active = false; };
  }, [bucket, offset, prefix]);

  const openFolder = (nextPrefix: string) => {
    setLoading(true);
    setOffset(0);
    setPrefix(nextPrefix);
  };

  const visible = useMemo(() => entries.filter((entry) =>
    entry.isFolder || !entry.mimeType || mediaKind === "image_or_video" ||
      (mediaKind === "instagram_image" ? entry.mimeType === "image/jpeg" : entry.mimeType.startsWith("video/"))
  ).filter((entry) => entry.name.toLowerCase().includes(search.trim().toLowerCase())), [entries, mediaKind, search]);

  const toggle = (url: string) => {
    setSelected((current) => {
      if (current.includes(url)) return current.filter((item) => item !== url);
      if (maximum === 1) return [url];
      if (current.length >= maximum) {
        toast.error(`Select at most ${maximum} images.`);
        return current;
      }
      return [...current, url];
    });
  };

  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section role="dialog" aria-modal="true" aria-labelledby="media-picker-title" className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl">
      <header className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="mr-auto"><h2 id="media-picker-title" className="text-lg font-semibold text-ink">Choose from Supabase Storage</h2><p className="text-xs text-muted">{maximum > 1 ? `Select up to ${maximum} JPEG images in carousel order.` : mediaKind === "video" ? "Select one video." : mediaKind === "instagram_image" ? "Select one JPEG image." : "Select one image or video."}</p></div>
        <select value={bucket} onChange={(event) => { setLoading(true); setOffset(0); setBucket(event.target.value as Bucket); setPrefix(""); }} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"><option value="event-posters">Event posters</option><option value="videos">Videos</option></select>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter this folder" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm">Close</button>
      </header>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted">
        <button type="button" disabled={!prefix} onClick={() => openFolder(parentFolder(prefix))} className="rounded-md border border-line px-2 py-1 disabled:opacity-40">Up</button>
        <span className="truncate">/{prefix}</span>
      </div>
      <div className="min-h-64 flex-1 overflow-y-auto p-4">
        {loading ? <p className="py-12 text-center text-sm text-muted">Loading media…</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visible.map((entry) => entry.isFolder ? <button type="button" key={entry.path} onClick={() => openFolder(entry.path)} className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-line bg-canvas p-3 text-center text-sm font-medium text-ink"><span className="text-3xl" aria-hidden="true">📁</span><span className="mt-2 break-all">{entry.name}</span></button> : entry.url && <button type="button" key={entry.path} onClick={() => toggle(entry.url!)} className={`overflow-hidden rounded-xl border bg-canvas text-left ${selected.includes(entry.url) ? "border-teal ring-2 ring-teal" : "border-line"}`}>
            <div className="relative aspect-square bg-white">{entry.mimeType?.startsWith("video/") ? <video src={entry.url} muted preload="metadata" className="h-full w-full object-cover" /> : <Image src={entry.url} alt="" fill sizes="(max-width: 640px) 50vw, 200px" className="object-cover" />}</div>
            <div className="p-2"><p className="truncate text-xs font-medium text-ink">{entry.name}</p>{selected.includes(entry.url) && <p className="mt-1 text-[10px] font-semibold text-teal">Selected {selected.indexOf(entry.url) + 1}</p>}</div>
          </button>)}
          {!visible.length && <p className="col-span-full py-12 text-center text-sm text-muted">No compatible media found in this folder.</p>}
        </div>}
        {!loading && hasMore && <div className="mt-4 text-center"><button type="button" disabled={loadingMore} onClick={() => { setLoadingMore(true); setOffset(entries.length); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button></div>}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-line p-4"><p className="text-sm text-muted">{selected.length} of {maximum} selected</p><button type="button" onClick={() => { onChange(selected); onClose(); }} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white">Use selected media</button></footer>
    </section>
  </div>;
}
