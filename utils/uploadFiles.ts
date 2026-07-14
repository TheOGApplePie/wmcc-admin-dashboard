import { createClient } from "./supabase/server";


function titleToFilename(title: string, ext: string): string {
  const base = title
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .trim()
    .replaceAll(/\s+/g, "_")
    .toLowerCase();
  return `${base}.${ext}`;
}
export async function resolveStorageUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  posterFile: File[],
  posterUrl: string | null,
  title: string,
): Promise<string> {
  if (posterFile.length) {
    const file = posterFile[0];
    const ext = file.name.split(".").pop() ?? "jpg";
    const baseFilename = titleToFilename(title, ext);
    const baseName = baseFilename.slice(0, -(ext.length + 1));

    const { data: existingFiles } = await supabase.storage
      .from("event-posters")
      .list("public");
    const existingNames = new Set((existingFiles ?? []).map((f) => f.name));

    let finalName = baseFilename;
    let count = 1;
    while (existingNames.has(finalName)) {
      finalName = `${baseName}_${count}.${ext}`;
      count++;
    }

    const uploaded = await supabase.storage
      .from("event-posters")
      .upload(`public/${finalName}`, file);
    if (uploaded.error) throw new Error("ERROR UPLOADING " + uploaded.error.message);
    if (uploaded.data.path.length) {
      return supabase.storage
        .from("event-posters")
        .getPublicUrl(uploaded.data.path).data.publicUrl;
    }
  }
  return posterUrl || "";
}
