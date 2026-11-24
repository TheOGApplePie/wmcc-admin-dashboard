"use server";
import { createSafeActionClient } from "next-safe-action";
import { CommunityFeedback } from "@/app/schemas/communityFeedback";
import z from "zod";
import { fromZonedTime } from "date-fns-tz";
import { requirePermission } from "@/utils/permissions";
const actionClient = createSafeActionClient();

export const fetchFeedback = actionClient
  .inputSchema(
    z.object({
      search: z.string().trim().max(200),
      currentPage: z.coerce.number().int().min(1).max(100000),
      pageSize: z.coerce.number().int().min(1).max(100),
      startDate: z.optional(z.coerce.date()),
      endDate: z.optional(z.coerce.date()),
    })
  )
  .action(async ({ parsedInput }) => {
    try {
      const { supabase } = await requirePermission("feedback", "view");
      let query = supabase
        .from("community-feedback")
        .select("*", { count: "exact" })
        .range(
          (parsedInput.currentPage - 1) * parsedInput.pageSize,
          (parsedInput.currentPage - 1) * parsedInput.pageSize +
            parsedInput.pageSize -
            1
        )
        .order("created_at", { ascending: false }).order("id", { ascending: false });

      if (parsedInput.search.length) {
        query = query.ilike("message", `%${parsedInput.search}%`);
      }
      if (parsedInput.startDate?.toDateString().length) {
        const startDate = fromZonedTime(`${parsedInput.startDate.toISOString().slice(0, 10)}T00:00:00`, "America/Toronto").toISOString();
        query = query.gte("created_at", startDate);
      }
      if (parsedInput.endDate?.toDateString().length) {
        const nextDay = new Date(parsedInput.endDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const endDate = fromZonedTime(`${nextDay.toISOString().slice(0, 10)}T00:00:00`, "America/Toronto").toISOString();
        query = query.lt("created_at", endDate);
      }
      const { data: feedback, count, error } = await query.overrideTypes<
        CommunityFeedback[]
      >();
      if (error) throw new Error(error.message);
      return { feedback, count };
    } catch (error) {
      console.error(error);
      throw error;
    }
  });
