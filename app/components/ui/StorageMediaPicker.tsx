"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import StorageUploadButton from "./StorageUploadButton";
import toast from "react-hot-toast";
import { listStorageMedia } from "@/actions/storageMedia";

type Bucket = "event-posters" | "videos";
type MediaKind = "image" | "instagram_image" | "video" | "image_or_video";
type StorageEntry = {
  name: string;
  path: string;
  isFolder: boolean;
  mimeType: string | null;
  size: number | null;
  url: string | null;
};

function matchesMedia(entry: StorageEntry, kind: MediaKind) {
  if (entry.isFolder) return true;
  const mime = entry.mimeType || inferredMime(entry.name);
  if (kind === "instagram_image") return mime === "image/jpeg";
  if (kind === "image") return mime.startsWith("image/");
  if (kind === "video") return mime.startsWith("video/");
  return mime.startsWith("image/") || mime.startsWith("video/");
}

function inferredMime(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
  return types[extension] ?? "";
}

function selectionHint(kind: MediaKind, maximum: number) {
  if (maximum > 1) return `Select up to ${maximum} images in order.`;
  if (kind === "video") return "Select one video.";
  if (kind === "instagram_image") return "Select one JPEG image.";
  if (kind === "image") return "Select one image.";
  return "Select one image or video.";
}

function parentFolder(prefix: string) {
  return prefix.split("/").slice(0, -1).join("/");
}

function StorageMediaEntry({ entry, selected, onOpenFolder, onSelect }: Readonly<{
  entry: StorageEntry;
  selected: string[];
  onOpenFolder: (path: string) => void;
  onSelect: (url: string) => void;
}>) {
  if (entry.isFolder) return <button type="button" onClick={() => onOpenFolder(entry.path)}
    className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-line bg-canvas p-3 text-center text-sm font-medium text-ink">
    <span className="text-3xl" aria-hidden="true">📁</span><span className="mt-2 break-all">{entry.name}</span>
  </button>;
  const url = entry.url;
  if (!url) return null;
  const selectionIndex = selected.indexOf(url);
  const isVideo = (entry.mimeType || inferredMime(entry.name)).startsWith("video/");
  return <button type="button" onClick={() => onSelect(url)} aria-pressed={selectionIndex >= 0}
    className={`overflow-hidden rounded-xl border bg-canvas text-left ${selectionIndex >= 0 ? "border-teal ring-2 ring-teal" : "border-line"}`}>
    <div className="relative aspect-square bg-white">
      {isVideo ? <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
        : <Image src={url} alt="" fill sizes="(max-width: 640px) 50vw, 200px" className="object-cover" />}
    </div>
    <div className="p-2"><p className="truncate text-xs font-medium text-ink">{entry.name}</p>
      {selectionIndex >= 0 && <p className="mt-1 text-[10px] font-semibold text-teal">Selected {selectionIndex + 1}</p>}
    </div>
  </button>;
}

function StorageResults({ loading, error, entries, selected, searching, hasMore, onClearSearch, onOpenFolder, onSelect, onRetry }: Readonly<{
  loading: boolean;
  error: string | null;
  entries: StorageEntry[];
  selected: string[];
  searching: boolean;
  hasMore: boolean;
  onClearSearch: () => void;
  onOpenFolder: (path: string) => void;
  onSelect: (url: string) => void;
  onRetry: () => void;
}>) {
  if (loading) return <p role="status" className="py-12 text-center text-sm text-muted">Loading media…</p>;
  if (error) return <div role="alert" className="py-12 text-center text-sm">
    <p className="text-coral">{error}</p>
    <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-line px-4 py-2">Retry loading</button>
  </div>;
  if (!entries.length) return <div role="status" className="py-12 text-center text-sm text-muted">
    <p>{searching ? "No matches in the loaded media." : "No compatible media in this folder’s loaded items."}</p>
    <p className="mt-2">{hasMore ? "Load more to check the remaining items." : "Upload media or choose another folder."}</p>
    {searching && <button type="button" onClick={onClearSearch} className="mt-3 rounded-lg border border-line px-4 py-2">Clear filter</button>}
  </div>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    {entries.map((entry) => <StorageMediaEntry key={entry.path} entry={entry} selected={selected}
      onOpenFolder={onOpenFolder} onSelect={onSelect} />)}
  </div>;
}

export default function StorageMediaPicker({ context, selectedUrls, maximum, mediaKind, onChange, onClose }: Readonly<{
  context: "social" | "announcements" | "events";
  selectedUrls: string[];
  maximum: number;
  mediaKind: MediaKind;
  onChange: (urls: string[]) => void;
  onClose: () => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const [bucket, setBucket] = useState<Bucket>(mediaKind === "video" ? "videos" : "event-posters");
  const [prefix, setPrefix] = useState("public");
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [selected, setSelected] = useState(selectedUrls);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    listStorageMedia({ context, bucket, prefix, offset }).then((result) => {
      if (!active) return;
      setLoading(false);
      setLoadingMore(false);
      if (result?.data?.error || result?.serverError || result?.validationErrors) {
        setLoadError(result?.data?.error || "Unable to browse media. Please try again.");
        return;
      }
      const page = result?.data?.data;
      if (!page) {
        setLoadError("Unable to browse media. Please try again.");
        return;
      }
      setLoadError(null);
      const nextEntries = (page?.entries ?? []) as StorageEntry[];
      setEntries((current) => offset === 0 ? nextEntries : [...current, ...nextEntries]);
      setHasMore(Boolean(page?.hasMore));
    }).catch(() => {
      if (!active) return;
      setLoading(false);
      setLoadingMore(false);
      setLoadError("Unable to browse media. Please try again.");
    });
    return () => { active = false; };
  }, [context, bucket, offset, prefix, refreshVersion]);

  const openFolder = (nextPrefix: string) => {
    if (uploading) return;
    setLoadError(null);
    setLoading(true);
    setSearch("");
    setOffset(0);
    setPrefix(nextPrefix);
  };

  const visible = useMemo(() => entries.filter((entry) => matchesMedia(entry, mediaKind))
    .filter((entry) => entry.name.toLowerCase().includes(search.trim().toLowerCase())), [entries, mediaKind, search]);

  const toggle = (url: string) => {
    if (selected.includes(url)) {
      setSelected(selected.filter((item) => item !== url));
      return;
    }
    if (maximum === 1) {
      setSelected([url]);
      return;
    }
    if (selected.length >= maximum) {
      toast.error(`Select at most ${maximum} items.`);
      return;
    }
    setSelected([...selected, url]);
  };

  return <dialog ref={dialogRef} onCancel={(event) => { if (uploading) event.preventDefault(); else onClose(); }} aria-labelledby={titleId}
    className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-5xl rounded-2xl bg-surface p-0 shadow-xl backdrop:bg-black/55">
    <div className="flex max-h-[90dvh] flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="mr-auto"><h2 id={titleId} className="text-lg font-semibold text-ink">Choose from Supabase Storage</h2><p className="text-xs text-muted">{selectionHint(mediaKind, maximum)}</p></div>
        <select aria-label="Media bucket" disabled={uploading || mediaKind !== "image_or_video"} value={bucket} onChange={(event) => { setLoadError(null); setSearch(""); setLoading(true); setOffset(0); setBucket(event.target.value as Bucket); setPrefix("public"); }} className="rounded-lg border border-line bg-white px-3 py-2 text-sm"><option value="event-posters">Event posters</option><option value="videos">Videos</option></select>
        <input aria-label="Filter this folder" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter this folder" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" />
        <button type="button" disabled={uploading} onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm">Close</button>
      </header>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted">
        <button type="button" disabled={uploading || !prefix} onClick={() => openFolder(parentFolder(prefix))} className="rounded-md border border-line px-2 py-1 disabled:opacity-40">Up</button>
        <span className="truncate">/{prefix}</span>
      </div>
      <div className="border-b border-line px-4 py-3">
        <StorageUploadButton context={context} bucket={bucket} prefix={prefix} mediaKind={mediaKind}
          uploading={uploading} onUploading={setUploading} onUploaded={(url) => {
            setLoadError(null);
            setSearch("");
            setOffset(0);
            setLoading(true);
            setRefreshVersion((version) => version + 1);
            setSelected((current) => {
              if (maximum === 1) return [url];
              if (current.length < maximum) return [...current, url];
              return current;
            });
          }} />
        <p className="mt-1 text-xs text-muted">Uploads are saved to {bucket}/{prefix} immediately, even if you cancel this picker.</p>
      </div>
      <div className="min-h-64 flex-1 overflow-y-auto p-4" aria-busy={loading || loadingMore}>
        <StorageResults loading={loading} error={loadError} entries={visible} selected={selected}
          searching={Boolean(search.trim())} hasMore={hasMore}
          onClearSearch={() => setSearch("")} onOpenFolder={openFolder} onSelect={toggle}
          onRetry={() => { setLoadError(null); setLoading(true); setRefreshVersion((version) => version + 1); }} />
        {!loading && !loadError && hasMore && <div className="mt-4 text-center"><button type="button" disabled={uploading || loadingMore} onClick={() => { setLoadingMore(true); setOffset(entries.length); }} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button></div>}
        {loadingMore && <p role="status" className="text-center text-sm text-muted">Loading more media…</p>}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-line p-4"><p role="status" className="text-sm text-muted">{selected.length} of {maximum} selected</p><button type="button" disabled={uploading || loading || loadingMore || Boolean(loadError) || selected.length === 0} onClick={() => { if (selected.length === 0) return; onChange(selected); onClose(); }} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Use selected media</button></footer>
    </div>
  </dialog>;
}
