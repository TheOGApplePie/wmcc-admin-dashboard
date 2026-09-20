"use server";

import { createSafeActionClient } from "next-safe-action";
import { revalidatePath } from "next/cache";
import { CampaignIdZod, CreateCampaignZod, UpdateCampaignZod, type SocialCampaign } from "@/app/schemas/socialCampaigns";
import { clientFail, fail, ok } from "@/utils/actionResponse";
import { logAudit } from "@/utils/audit";
import { requirePermission } from "@/utils/permissions";

const actionClient = createSafeActionClient();
const REVALIDATE = "/dashboard/posts";
const SELECT = "*, events(title, start_date, is_recurring)";

export const getSocialCampaigns = actionClient.action(async () => {
  try {
    const { supabase } = await requirePermission("social", "view");
    const { data, error } = await supabase
      .from("social_campaigns")
      .select(SELECT)
      .order("needs_review", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ok((data ?? []) as SocialCampaign[]);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), "Failed to load campaigns.");
  }
});

export const createSocialCampaign = actionClient
  .inputSchema(CreateCampaignZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase, user } = await requirePermission("social", "edit");
      const { data, error } = await supabase
        .from("social_campaigns")
        .insert({ ...parsedInput, event_id: parsedInput.event_id ?? null, created_by: user.id })
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", data.id, "create", data.name);
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, "Campaign created.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to create campaign.");
    }
  });

export const updateSocialCampaign = actionClient
  .inputSchema(UpdateCampaignZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "edit");
      if (parsedInput.status === "archived") {
        return clientFail("Archive campaigns through the archive action.");
      }
      const { id, ...changes } = parsedInput;
      const { data, error } = await supabase
        .from("social_campaigns")
        .update(changes)
        .eq("id", id)
        .neq("status", "archived")
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", id, "update", data.name);
      revalidatePath(REVALIDATE);
      return ok(data as SocialCampaign, "Campaign updated.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to update campaign.");
    }
  });

export const archiveSocialCampaign = actionClient
  .inputSchema(CampaignIdZod)
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("social", "delete");
      // Campaigns are archived rather than deleted so delivery history survives.
      const { error } = await supabase
        .from("social_campaigns")
        .update({ status: "archived" })
        .eq("id", parsedInput.id);
      if (error) throw new Error(error.message);
      await logAudit(supabase, "social_campaign", parsedInput.id, "archive");
      revalidatePath(REVALIDATE);
      return ok(null, "Campaign archived.");
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), "Failed to archive campaign.");
    }
  });
