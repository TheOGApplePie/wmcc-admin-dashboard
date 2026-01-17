"use server";
import { createSafeActionClient } from "next-safe-action";
import { createClient } from "../../utils/supabase/server";
import { CommunityFeedback } from "@/app/schemas/communityFeedback";
import z from "zod";
const actionClient = createSafeActionClient();

export const fetchFeedback = actionClient
  .inputSchema(
    z.object({
      search: z.string(),
      currentPage: z.coerce.number(),
      pageSize: z.coerce.number(),
      startDate: z.optional(z.coerce.date()),
      endDate: z.optional(z.coerce.date()),
    })
  )
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      let query = supabase
        .from("community-feedback")
        .select("*", { count: "exact" })
        .range(
          (parsedInput.currentPage - 1) * parsedInput.pageSize,
          (parsedInput.currentPage - 1) * parsedInput.pageSize +
            parsedInput.pageSize -
            1
        )
        .order("id", { ascending: true });

      if (parsedInput.search.length) {
        query = query.ilike("message", `%${parsedInput.search}%`);
      }
      if (parsedInput.startDate?.toDateString().length) {
        const startDate = new Date(parsedInput.startDate).toDateString();
        query = query.gte("created_at", startDate);
      }
      if (parsedInput.endDate?.toDateString().length) {
        const endDate = new Date(parsedInput.endDate).toDateString();
        query = query.lte("created_at", endDate);
      }
      const { data: feedback, count } = await query.overrideTypes<
        CommunityFeedback[]
      >();
      return { feedback, count };
    } catch (error) {
      console.error(error);
      throw error;
    }
  });
