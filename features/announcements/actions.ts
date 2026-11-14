"use server";
import { Announcement, AnnouncementZod, ReorderAnnouncementsZod } from "@/app/schemas/announcement";
import { createSafeActionClient } from "next-safe-action";
import z from "zod";
import { revalidatePath } from "next/cache";
import { resolveStorageUrl } from "@/utils/uploadFiles";
import { requirePermission } from "@/utils/permissions";

const actionClient = createSafeActionClient();

function throwOnSupabaseError(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}

export const createAnnouncement = actionClient
  .inputSchema(AnnouncementZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("announcements", "edit");
      const storageUrl = await resolveStorageUrl(
        supabase,
        parsedInput.poster_file,
        parsedInput.poster_url,
        parsedInput.title,
      );

      const insertResult = await supabase.from("announcements").insert({
        publish_at: parsedInput.publish_at,
        title: parsedInput.title,
        description: parsedInput.description,
        poster_url: storageUrl,
        poster_alt: parsedInput.poster_alt,
        call_to_action_link: parsedInput.call_to_action_link,
        call_to_action_caption: parsedInput.call_to_action_caption,
        expires_at: new Date(parsedInput.expires_at),
      }).select("id").single();
      throwOnSupabaseError(insertResult);
      revalidatePath("/dashboard/announcements");
      return { success: true };
    } catch (error) {
      console.error(error);
      return { error: error instanceof Error ? error.message : "Unable to update announcements. Please try again." };
    }
  });

export const editAnnouncement = actionClient
  .inputSchema(AnnouncementZod.safeExtend({ id: z.number().int().positive() }))
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("announcements", "edit");
      const storageUrl = await resolveStorageUrl(
        supabase,
        parsedInput.poster_file,
        parsedInput.poster_url,
        parsedInput.title,
      );
      const updateResult = await supabase
        .from("announcements")
        .update({
          publish_at: parsedInput.publish_at,
          title: parsedInput.title,
          description: parsedInput.description,
          poster_url: storageUrl,
          poster_alt: parsedInput.poster_alt,
          call_to_action_link: parsedInput.call_to_action_link,
          call_to_action_caption: parsedInput.call_to_action_caption,
          expires_at: new Date(parsedInput.expires_at),
        })
        .eq("id", parsedInput.id).select("id").single();
      throwOnSupabaseError(updateResult);
      revalidatePath("/dashboard/announcements");
      return { success: true };
    } catch (error) {
      console.error(error);
      return { error: error instanceof Error ? error.message : "Unable to update announcements. Please try again." };
    }
  });

export const deleteAnnouncement = actionClient
  .inputSchema(z.object({ id: z.coerce.number() }))
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("announcements", "delete");
      const deleteResult = await supabase.from("announcements").delete().eq("id", parsedInput.id).select("id").single();
      throwOnSupabaseError(deleteResult);
      revalidatePath("/dashboard/announcements");
      return { success: true };
    } catch (error) {
      console.error(error);
      throw error;
    }
  });

export const fetchAnnouncements = actionClient.inputSchema(z.object({
  scheduledPage: z.number().int().min(1).max(100000).default(1),
  expiredPage: z.number().int().min(1).max(100000).default(1),
})).action(async ({ parsedInput }) => {
  const { supabase } = await requirePermission("announcements", "view");
  const now = new Date().toISOString();
  const fields = "id,publish_at,title,description,poster_url,poster_alt,call_to_action_link,call_to_action_caption,expires_at,created_at,display_order";
  const base = () => supabase.from("announcements").select(fields, { count: "exact" })
    .order("display_order", { ascending: true, nullsFirst: false }).order("id");
  const [scheduled, expired] = await Promise.all([
    base().gt("publish_at", now).range((parsedInput.scheduledPage - 1) * 50, parsedInput.scheduledPage * 50 - 1),
    base().or(`publish_at.is.null,publish_at.lte.${now}`).lte("expires_at", now)
      .range((parsedInput.expiredPage - 1) * 50, parsedInput.expiredPage * 50 - 1),
  ]);
  if (scheduled.error || expired.error) throw new Error(scheduled.error?.message ?? expired.error?.message);
  // The live rotation is a single reorderable form. Load only active rows, in database pages.
  const live: Announcement[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await base().or(`publish_at.is.null,publish_at.lte.${now}`).gt("expires_at", now).range(offset, offset + 499);
    if (error) throw new Error(error.message);
    live.push(...(data ?? []) as unknown as Announcement[]);
    if (!data || data.length < 500) break;
  }
  return { live, scheduled: scheduled.data as unknown as Announcement[], expired: expired.data as unknown as Announcement[],
    scheduledTotal: scheduled.count ?? 0, expiredTotal: expired.count ?? 0 };
});

export const reorderAnnouncements = actionClient
  .inputSchema(ReorderAnnouncementsZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("announcements", "edit");
      const result = await supabase.rpc("reorder_announcements", { p_ids: parsedInput.ids });
      throwOnSupabaseError(result);
      revalidatePath("/dashboard/announcements");
      return { success: true };
    } catch (error) {
      console.error(error);
      return { error: error instanceof Error ? error.message : "Unable to update announcements. Please try again." };
    }
  });

export const restoreAnnouncement = actionClient
  .inputSchema(z.object({ id: z.coerce.number(), expires_at: z.coerce.date() }))
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("announcements", "edit");
      const restoreResult = await supabase
        .from("announcements")
        .update({ expires_at: parsedInput.expires_at, publish_at: null })
        .eq("id", parsedInput.id).select("id").single();
      throwOnSupabaseError(restoreResult);
      revalidatePath("/dashboard/announcements");
      return { success: true };
    } catch (error) {
      console.error(error);
      return { error: error instanceof Error ? error.message : "Unable to update announcements. Please try again." };
    }
  });
