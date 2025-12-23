"use server";
import { Announcement, AnnouncementZod } from "@/app/schemas/announcement";
import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../../utils/supabase/server";
import z from "zod";
import { revalidatePath } from "next/cache";

const actionClient = createSafeActionClient();
function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD") // Decompose accented characters
    .replaceAll(/[\u0300-\u036f]/g, "") // Remove accents
    .replaceAll(/[^a-zA-Z0-9._-]/g, "_"); // Replace special chars with underscore
}
export const createAnnouncement = actionClient
  .inputSchema(AnnouncementZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let storageUrl = parsedInput.poster_url || "";

      if (parsedInput.poster_file.length) {
        const fileUploaded = await uploadFile(
          new Date().toDateString() +
            "_" +
            sanitizeFilename(parsedInput.poster_file[0].name),
          parsedInput.poster_file[0]
        );

        if (fileUploaded.error) {
          throw new Error("ERROR UPLOADING " + fileUploaded.error.message);
        }

        if (fileUploaded.data.path.length) {
          const uploadedFile = supabase.storage
            .from("event-posters")
            .getPublicUrl(fileUploaded.data.path);
          storageUrl = uploadedFile.data.publicUrl;
        }
      }
      await supabase.from("announcements").insert({
        title: parsedInput.title,
        description: parsedInput.description,
        poster_url: storageUrl,
        poster_alt: parsedInput.poster_alt,
        call_to_action_link: parsedInput.call_to_action_link,
        call_to_action_caption: parsedInput.call_to_action_caption,
        expires_at: new Date(parsedInput.expires_at),
      });
      revalidatePath("/dashboard/announcements");
    } catch (error) {
      console.error(error);
      return { error };
    }
  });

export const editAnnouncement = actionClient
  .inputSchema(AnnouncementZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let storageUrl = parsedInput.poster_url || "";

      if (parsedInput.poster_file.length) {
        const fileUploaded = await uploadFile(
          new Date().toDateString() +
            "_" +
            sanitizeFilename(parsedInput.poster_file[0].name),
          parsedInput.poster_file[0]
        );

        if (fileUploaded.error) {
          throw new Error("ERROR UPLOADING " + fileUploaded.error.message);
        }

        if (fileUploaded.data.path.length) {
          const uploadedFile = supabase.storage
            .from("event-posters")
            .getPublicUrl(fileUploaded.data.path);
          storageUrl = uploadedFile.data.publicUrl;
        }
      }
      await supabase
        .from("announcements")
        .update({
          title: parsedInput.title,
          description: parsedInput.description,
          poster_url: storageUrl,
          poster_alt: parsedInput.poster_alt,
          call_to_action_link: parsedInput.call_to_action_link,
          call_to_action_caption: parsedInput.call_to_action_caption,
          expires_at: new Date(parsedInput.expires_at),
        })
        .eq("id", parsedInput.id);
      revalidatePath("/dashboard/announcements");
    } catch (error) {
      console.error(error);
      return { error };
    }
  });

export const deleteAnnouncement = actionClient
  .inputSchema(z.object({ id: z.coerce.number() }))
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      await supabase.from("announcements").delete().eq("id", parsedInput.id);
      revalidatePath("/dashboard/announcements");
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

export const fetchAnnouncements = actionClient.action(async () => {
  try {
    const supabase = await createClient();

    const { data: announcements } = await supabase
      .from("announcements")
      .select()
      .order("id", { ascending: true })
      .overrideTypes<Announcement[]>();
    return announcements;
  } catch (error) {
    console.error(error);
    throw error;
  }
});

const uploadFile = async (name: string, file: z.core.File) => {
  const supabase = await createClient();

  const fileUploaded = await supabase.storage
    .from("event-posters")
    .upload(`public/${name}`, file);
  return fileUploaded;
};
