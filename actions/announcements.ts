"use server";
import { Announcement, AnnouncementZod } from "@/app/schemas/announcement";
import { ResponseCodes } from "@/app/enums/responseCodes";
import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../utils/supabase/server";
import z from "zod";

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
      if (parsedInput.id) {
        const { data, error, count } = await supabase
          .from("announcements")
          .update({
            title: parsedInput.title,
            description: parsedInput.description,
            poster_url: storageUrl,
            poster_alt: parsedInput.poster_alt,
            call_to_action_link: parsedInput.call_to_action_link,
            call_to_action_caption: parsedInput.call_to_action_caption,
            expires_at: new Date(),
          })
          .eq("id", parsedInput.id);
        return {
          error: error?.message ?? "",
          data,
          count: count,
          status: ResponseCodes.SUCCESS,
          statusText: "Announcement updated successfully!",
        };
      } else {
        const { data, error, count } = await supabase
          .from("announcements")
          .insert({
            title: parsedInput.title,
            description: parsedInput.description,
            poster_url: storageUrl,
            poster_alt: parsedInput.poster_alt,
            call_to_action_link: parsedInput.call_to_action_link,
            call_to_action_caption: parsedInput.call_to_action_caption,
            expires_at: new Date(),
          });
        return {
          error: error?.message ?? "",
          data,
          count: count,
          status: ResponseCodes.SUCCESS,
          statusText: "Announcement created successfully!",
        };
      }
    } catch (error) {
      console.error(error);

      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
        count: null,
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Internal Server Error",
      };
    }
  });

export const deleteAnnouncement = actionClient
  .inputSchema(z.object({ id: z.coerce.number() }))
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const announcementDeleted = await supabase
        .from("announcements")
        .delete()
        .eq("id", parsedInput.id);
      return {
        error: announcementDeleted.error?.message ?? "",
        data: announcementDeleted.data,
        count: announcementDeleted.count,
        status: ResponseCodes.SUCCESS,
        statusText: announcementDeleted.statusText,
      };
    } catch (error) {
      console.error(error);
      return {
        error: error instanceof Error ? error.message : String(error),
        data: null,
        count: null,
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Internal Server Error",
      };
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
    return {
      error: null,
      data: announcements,
      count: announcements?.length,
      status: ResponseCodes.SUCCESS,
      statusText: "Announcements found successfully",
    };
  } catch (error) {
    console.error(error);
    return {
      error: error instanceof Error ? error.message : String(error),
      data: [],
      count: 0,
      status: ResponseCodes.SERVER_ERROR,
      statusText: "Internal Server Error",
    };
  }
});

const uploadFile = async (name: string, file: z.core.File) => {
  const supabase = await createClient();

  const fileUploaded = await supabase.storage
    .from("event-posters")
    .upload(`public/${name}`, file);
  return fileUploaded;
};
