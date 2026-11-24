"use server";

import { createSafeActionClient } from "next-safe-action";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/utils/permissions";

export const setRegistrationAvailability = createSafeActionClient()
  .inputSchema(z.object({
    eventId: z.number().int().positive(), revision: z.number().int().min(0),
    action: z.enum(["open", "close", "schedule"]), reopenAt: z.iso.datetime({ offset: true }).nullable(),
  }))
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("events", "edit");
      const { error } = await supabase.rpc("set_registration_availability", {
        p_event_id: parsedInput.eventId, p_revision: parsedInput.revision,
        p_action: parsedInput.action, p_reopen_at: parsedInput.reopenAt,
      });
      if (error?.code === "40001") return { error: "Registration settings changed. Reload and try again." };
      if (error) throw new Error(error.message);
      revalidatePath(`/dashboard/events/${parsedInput.eventId}/registrants`);
      return { success: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to update registration settings." };
    }
  });
