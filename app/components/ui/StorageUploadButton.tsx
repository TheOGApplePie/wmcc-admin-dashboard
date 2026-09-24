"use client";

import { useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { prepareStorageUpload } from "@/actions/storageMedia";

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png"] as const;
const VIDEO_TYPES = ["video/mp4"] as const;
type ContentType = typeof IMAGE_TYPES[number] | typeof VIDEO_TYPES[number];

interface Props {
  context: "social" | "announcements" | "events";
  bucket: "event-posters" | "videos";
  prefix: string;
  mediaKind: "image" | "instagram_image" | "video" | "image_or_video";
  uploading: boolean;
  onUploading: (uploading: boolean) => void;
  onUploaded: (url: string) => void;
}

function acceptedTypes(bucket: Props["bucket"], kind: Props["mediaKind"]): readonly ContentType[] {
  if (kind === "instagram_image") return ["image/jpeg", "image/jpg"];
  if (bucket === "videos") return VIDEO_TYPES;
  return IMAGE_TYPES;
}

async function uploadFile(file: File, props: Props) {
  const types = acceptedTypes(props.bucket, props.mediaKind);
  if (!types.includes(file.type as ContentType)) throw new Error("Choose a supported file type for this folder.");
  const limit = props.bucket === "videos" ? 50 : 5;
  if (!file.size || file.size > limit * 1024 * 1024) throw new Error(`Choose a non-empty file up to ${limit} MB.`);
  const contentType = file.type === "image/jpg" ? "image/jpeg" : file.type as ContentType;
  const result = await prepareStorageUpload({ context: props.context, bucket: props.bucket, prefix: props.prefix,
    mediaKind: props.mediaKind, name: file.name, contentType, size: file.size });
  const target = result?.data?.data;
  if (!target) throw new Error(result?.data?.error || "Unable to prepare upload. Check your permission and file details.");
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await client.storage.from(props.bucket).uploadToSignedUrl(target.path, target.token, file, { contentType });
  if (error) throw new Error(error.message);
  return target.url;
}

export default function StorageUploadButton(props: Readonly<Props>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  async function handleFile(file?: File) {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setFeedback(null);
    props.onUploading(true);
    try {
      const url = await uploadFile(file, props);
      props.onUploaded(url);
      setFeedback({ kind: "success", message: `${file.name} uploaded successfully. Check your selection below before continuing.` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Upload failed. Please try again." });
    } finally {
      busyRef.current = false;
      props.onUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  return <div aria-busy={props.uploading}>
    <input ref={inputRef} type="file" className="hidden" accept={acceptedTypes(props.bucket, props.mediaKind).join(",")}
      onChange={(event) => void handleFile(event.target.files?.[0])} />
    <button type="button" disabled={props.uploading} onClick={() => inputRef.current?.click()}
      className="rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {props.uploading ? "Uploading…" : "Upload media"}
    </button>
    {props.uploading && <p role="status" className="mt-2 text-xs text-muted">Uploading to storage. Please wait…</p>}
    {feedback && <p role={feedback.kind === "error" ? "alert" : "status"}
      className={feedback.kind === "error" ? "mt-2 text-xs text-coral" : "mt-2 text-xs text-teal"}>{feedback.message}</p>}
    <span className="ml-2 text-xs text-muted">{props.bucket === "videos" ? "MP4 · up to 50 MB" : "JPEG/JPG/PNG · up to 5 MB"}</span>
  </div>;
}
