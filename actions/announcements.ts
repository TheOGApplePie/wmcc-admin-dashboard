"use server";
import { AnnouncementZod } from "@/app/schemas/announcement";
import { ResponseCodes } from "@/app/enums/responseCodes";
import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../utils/supabase/server";

const actionClient = createSafeActionClient();
function sanitizeFilename(filename: string): string {
  return filename
    .normalize("NFD") // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-zA-Z0-9._-]/g, "_"); // Replace special chars with underscore
}
export const createAnnouncement = actionClient
  .inputSchema(AnnouncementZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let storageUrl = parsedInput.poster_url || "";
      console.log("URL: ", parsedInput.poster_url);
      if (parsedInput.poster_file.length) {
        const fileUploaded = await supabase.storage
          .from("event-posters")
          .upload(
            `public/${sanitizeFilename(parsedInput.poster_file[0].name)}`,
            parsedInput.poster_file[0],
          );

        if (fileUploaded.error) {
          const deletedFile = await supabase.storage
            .from("event-posters")
            .remove([
              `public/${sanitizeFilename(parsedInput.poster_file[0].name)}`,
            ]);

          if (deletedFile.error) {
            console.error(
              "Error deleting file after upload error: ",
              deletedFile.error.message,
            );
          } else if (deletedFile.data) {
            console.info(
              `File with name ${deletedFile.data.length} successfully deleted after upload error`,
            );
          }
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
        const { data, error, count, statusText } = await supabase
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
          statusText: statusText,
        };
      } else {
        const { data, error, count, statusText } = await supabase
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
          statusText: statusText,
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
