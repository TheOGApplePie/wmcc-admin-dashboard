import { createClient } from "./supabase/server";
function titleToFilename(title: string, ext: string): string {
  const base =
    title
      .normalize("NFD")
      .replaceAll(/[̀-ͯ]/g, "")
      .trim()
      .replaceAll(/\s+/g, "_")
      .replaceAll(/[^a-zA-Z0-9_-]+/g, "_")
      .replaceAll(/_+/g, "_")
      .replaceAll(/^_+|_+$/g, "")
      .toLowerCase() || "event";
  return `${base}.${ext}`;
}

function extensionForMimeType(mimeType: string): "jpg" | "png" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  throw new Error("Only JPG, JPEG, and PNG poster images are supported.");
}
export async function resolveStorageUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  posterFile: File | File[] | null,
  posterUrl: string | null,
  title: string,
): Promise<string | null> {
  const file = Array.isArray(posterFile) ? posterFile[0] : posterFile;
  if (file) {
    const ext = extensionForMimeType(file.type);
    const baseFilename = titleToFilename(title, ext);
    const baseName = baseFilename.slice(0, -(ext.length + 1));

    const path = `public/${baseName}_${crypto.randomUUID()}.${ext}`;
    const uploaded = await supabase.storage
      .from("event-posters")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (uploaded.error)
      throw new Error(`Poster upload failed: ${uploaded.error.message}`);
    return supabase.storage.from("event-posters").getPublicUrl(path).data
      .publicUrl;
  }
  return posterUrl;
}
