import { createClient } from "./supabase/server";
function titleToFilename(title: string, ext: string): string {
  const base = title
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

    // Let Storage's atomic create-if-absent behavior resolve races. The base
    // attempt plus three numeric retries avoids listing/paginating the bucket.
    for (let attempt = 0; attempt <= 3; attempt++) {
      const finalName = attempt === 0
        ? baseFilename
        : `${baseName}_${attempt}.${ext}`;
      const uploaded = await supabase.storage
        .from("event-posters")
        .upload(`public/${finalName}`, file, {
          upsert: false,
          contentType: file.type,
        });

      if (!uploaded.error && uploaded.data.path) {
        return supabase.storage
          .from("event-posters")
          .getPublicUrl(uploaded.data.path).data.publicUrl;
      }

      const conflict = uploaded.error &&
        ("statusCode" in uploaded.error && String(uploaded.error.statusCode) === "409" ||
          /already exists|duplicate/i.test(uploaded.error.message));
      if (!conflict) {
        throw new Error(`ERROR UPLOADING ${uploaded.error?.message ?? "Unknown storage error"}`);
      }
    }

    throw new Error(
      "A poster with this title already exists for all three numbered variants. Rename it or upload the poster later.",
    );
  }
  return posterUrl;
}
