"use server";
import { Announcement, AnnouncementZod } from "@/app/schemas/announcement";
import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../../utils/supabase/server";
import z from "zod";
import { revalidatePath } from "next/cache";
import { resolveStorageUrl } from "@/utils/uploadFiles";
import { assertPermission } from "@/features/access/server";

const actionClient = createSafeActionClient();

export const createAnnouncement = actionClient
  .inputSchema(AnnouncementZod)
  .action(async ({ parsedInput }) => {
    try {
      await assertPermission("announcements", "edit");
      const supabase = await createClient();
      const storageUrl = await resolveStorageUrl(
        supabase,
        parsedInput.poster_file,
        parsedInput.poster_url,
        parsedInput.title,
      );

      const { error } = await supabase.from("announcements").insert({
        title: parsedInput.title,
        description: parsedInput.description,
        poster_url: storageUrl,
        poster_alt: parsedInput.poster_alt,
        call_to_action_link: parsedInput.call_to_action_link,
        call_to_action_caption: parsedInput.call_to_action_caption,
        expires_at: new Date(parsedInput.expires_at),
      });
      if (error) throw new Error(error.message);
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
      await assertPermission("announcements", "edit");
      const supabase = await createClient();
      const storageUrl = await resolveStorageUrl(
        supabase,
        parsedInput.poster_file,
        parsedInput.poster_url,
        parsedInput.title,
      );
      const { error } = await supabase
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
      if (error) throw new Error(error.message);
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
      await assertPermission("announcements", "delete");
      const supabase = await createClient();
      const { error } = await supabase.from("announcements").delete().eq("id", parsedInput.id);
      if (error) throw new Error(error.message);
      revalidatePath("/dashboard/announcements");
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

export const fetchAnnouncements = actionClient.action(async () => {
  try {
    await assertPermission("announcements", "view");
    const supabase = await createClient();

    const { data: announcements, error } = await supabase
      .from("announcements")
      .select()
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .overrideTypes<Announcement[]>();
    if (error) throw new Error(error.message);
    return announcements;
  } catch (error) {
    console.error(error);
    throw error;
  }
});

export const reorderAnnouncements = actionClient
  .inputSchema(z.object({ ids: z.array(z.number()) }))
  .action(async ({ parsedInput }) => {
    try {
      await assertPermission("announcements", "edit");
      const supabase = await createClient();
      const results = await Promise.all(
        parsedInput.ids.map((id, index) =>
          supabase
            .from("announcements")
            .update({ display_order: index + 1 })
            .eq("id", id),
        ),
      );
      const failure = results.find((result) => result.error);
      if (failure?.error) throw new Error(failure.error.message);
      revalidatePath("/dashboard/announcements");
    } catch (error) {
      console.error(error);
      return { error };
    }
  });

export const restoreAnnouncement = actionClient
  .inputSchema(z.object({ id: z.coerce.number(), expires_at: z.coerce.date() }))
  .action(async ({ parsedInput }) => {
    try {
      await assertPermission("announcements", "edit");
      const supabase = await createClient();
      const { error } = await supabase
        .from("announcements")
        .update({ expires_at: parsedInput.expires_at })
        .eq("id", parsedInput.id);
      if (error) throw new Error(error.message);
      revalidatePath("/dashboard/announcements");
    } catch (error) {
      console.error(error);
      return { error };
    }
  });
