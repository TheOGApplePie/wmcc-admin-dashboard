"use server";
import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import { createClient } from "../utils/supabase/server";
import { revalidatePath } from "next/cache";
import { ResponseCodes } from "@/app/enums/responseCodes";
import {
  InitializeCampaignZod,
  CreatePostZod,
  UpdatePostZod,
  DeletePostZod,
  SchedulePostZod,
  RevertPostZod,
  MarkPostManualSentZod,
  BulkDeletePostsZod,
  RegenerateScheduleZod,
  FetchPostsZod,
  FetchCampaignZod,
  FetchAuditLogsZod,
  AssignPostZod,
} from "@/app/schemas/postScheduling";
import {
  generateDefaultSchedule,
  resolveScheduledAt,
  getTodayET,
} from "@/features/postScheduling/scheduleGenerator";
import { resolveSlotCollision } from "@/features/postScheduling/constraintEngine";
import { logAudit } from "@/utils/audit";

const actionClient = createSafeActionClient();

// ─── Initialize campaign (create campaign + optionally generate default posts) ─

export const initializeCampaign = actionClient
  .inputSchema(InitializeCampaignZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { event_id, generate } = parsedInput;

      // Fetch event
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("*, recurrence_rule(*)")
        .eq("id", event_id)
        .single();
      if (eventError || !event) throw new Error(eventError?.message ?? "Event not found.");

      const eventDateStr = new Date(event.start_date).toISOString().split("T")[0];
      const todayStr = getTodayET();

      if (eventDateStr < todayStr) {
        return {
          error: "Cannot create a schedule for a past event.",
          status: ResponseCodes.SERVER_ERROR,
          statusText: "Event is in the past.",
          campaign_id: null,
          conflicts: [],
        };
      }

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from("post_campaigns")
        .insert({ event_id, is_recurring_anchor: event.is_recurring })
        .select("id")
        .single();
      if (campaignError) throw new Error(campaignError.message);

      const conflicts: string[] = [];

      if (generate) {
        const drafts = generateDefaultSchedule(eventDateStr, todayStr);
        const resolvedDrafts = [];

        const { data: existingPosts } = await supabase
          .from("scheduled_posts")
          .select("*")
          .eq("event_id", event_id);

        const working = [...(existingPosts ?? [])];

        for (const draft of drafts) {
          const resolved = resolveSlotCollision(
            working as never,
            draft.scheduled_date,
            draft.time_slot,
            event_id,
          );
          if (!resolved) {
            conflicts.push(
              `No available slot for ${draft.post_type} post around ${draft.scheduled_date}.`,
            );
            continue;
          }
          const finalDraft = {
            ...draft,
            scheduled_date: resolved.date,
            time_slot: resolved.slot,
            scheduled_at: resolveScheduledAt(resolved.date, resolved.slot),
            campaign_id: campaign.id,
            event_id,
            status: "draft" as const,
          };
          resolvedDrafts.push(finalDraft);
          working.push(finalDraft as never);
        }

        if (resolvedDrafts.length > 0) {
          const { error: insertError } = await supabase
            .from("scheduled_posts")
            .insert(resolvedDrafts);
          if (insertError) throw new Error(insertError.message);
        }
      }

      revalidatePath(`/dashboard/events/${event_id}/posts`);
      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: generate
          ? `Schedule generated with ${conflicts.length === 0 ? "default" : "some"} posts.`
          : "Campaign created.",
        campaign_id: campaign.id,
        conflicts,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to initialize campaign.",
        campaign_id: null,
        conflicts: [],
      };
    }
  });

// ─── Create a single post manually ───────────────────────────────────────────

export const createScheduledPost = actionClient
  .inputSchema(CreatePostZod)
  .action(async ({ parsedInput }) => {
    try {
      if (parsedInput.scheduled_date < getTodayET()) {
        return {
          error: "Cannot schedule a post for a past date.",
          status: ResponseCodes.SERVER_ERROR,
          statusText: "Past date.",
        };
      }

      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const creatorEmail = user?.email ?? null;
      const scheduled_at = resolveScheduledAt(parsedInput.scheduled_date, parsedInput.time_slot);
      const { data: inserted, error } = await supabase.from("scheduled_posts").insert({
        ...parsedInput,
        scheduled_at,
        status: "draft",
        created_by_email: creatorEmail,
        assigned_to_email: creatorEmail,
      }).select("id").single();
      if (error) throw new Error(error.message);
      if (inserted) await logAudit(supabase, "scheduled_post", inserted.id, "create", `${parsedInput.post_type} on ${parsedInput.scheduled_date}`);
      revalidatePath(`/dashboard/events/${parsedInput.event_id}/posts`);
      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Post created.", id: inserted?.id ?? null };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to create post.",
      };
    }
  });

// ─── Schedule a draft post (locks it in for cron) ────────────────────────────

export const schedulePost = actionClient
  .inputSchema(SchedulePostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const scheduled_at = resolveScheduledAt(parsedInput.scheduled_date, parsedInput.time_slot);

      const { error } = await supabase
        .from("scheduled_posts")
        .update({
          status: "scheduled",
          scheduled_date: parsedInput.scheduled_date,
          time_slot: parsedInput.time_slot,
          scheduled_at,
          requires_manual: true, // Phase 1: all posts require manual sending
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsedInput.id)
        .eq("status", "draft");
      if (error) throw new Error(error.message);
      await logAudit(supabase, "scheduled_post", parsedInput.id, "schedule", `${parsedInput.scheduled_date} ${parsedInput.time_slot}`);
      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Post scheduled." };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to schedule post.",
      };
    }
  });

// ─── Revert a scheduled or failed post back to draft ─────────────────────────

export const revertPostToDraft = actionClient
  .inputSchema(RevertPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("scheduled_posts")
        .update({
          status: "draft",
          retry_count: 0,
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsedInput.id)
        .in("status", ["scheduled", "failed"]);
      if (error) throw new Error(error.message);
      await logAudit(supabase, "scheduled_post", parsedInput.id, "revert");
      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Post reverted to draft." };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to revert post.",
      };
    }
  });

// ─── Mark a manual post as sent ───────────────────────────────────────────────

export const markPostManualSent = actionClient
  .inputSchema(MarkPostManualSentZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("scheduled_posts")
        .update({ status: "posted", updated_at: new Date().toISOString() })
        .eq("id", parsedInput.id)
        .eq("requires_manual", true)
        .eq("status", "scheduled");
      if (error) throw new Error(error.message);
      await logAudit(supabase, "scheduled_post", parsedInput.id, "mark_sent");
      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Post marked as sent." };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to mark post as sent.",
      };
    }
  });

// ─── Bulk delete posts by status ──────────────────────────────────────────────

export const bulkDeletePosts = actionClient
  .inputSchema(BulkDeletePostsZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("scheduled_posts")
        .delete()
        .eq("campaign_id", parsedInput.campaign_id)
        .in("status", parsedInput.statuses);
      if (error) throw new Error(error.message);
      await logAudit(supabase, "post_campaign", parsedInput.campaign_id, "bulk_delete", `statuses: ${parsedInput.statuses.join(", ")}`);
      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Posts deleted." };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to delete posts.",
      };
    }
  });

// ─── Update post content / slot ───────────────────────────────────────────────

export const updateScheduledPost = actionClient
  .inputSchema(UpdatePostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const scheduled_at = resolveScheduledAt(
        parsedInput.scheduled_date,
        parsedInput.time_slot,
      );
      const { error } = await supabase
        .from("scheduled_posts")
        .update({
          post_type: parsedInput.post_type,
          platforms: parsedInput.platforms,
          cross_post_facebook: parsedInput.cross_post_facebook,
          banner_image_url: parsedInput.banner_image_url,
          caption: parsedInput.caption,
          hashtags: parsedInput.hashtags,
          whatsapp_text: parsedInput.whatsapp_text,
          scheduled_date: parsedInput.scheduled_date,
          time_slot: parsedInput.time_slot,
          scheduled_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", parsedInput.id)
        .not("status", "in", '("posted","scheduled")');
      if (error) throw new Error(error.message);
      await logAudit(supabase, "scheduled_post", parsedInput.id, "update");
      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Post updated." };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to update post.",
      };
    }
  });

// ─── Fetch audit logs for an entity ──────────────────────────────────────────

export const fetchAuditLogs = actionClient
  .inputSchema(FetchAuditLogsZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity_type", parsedInput.entity_type)
        .eq("entity_id", parsedInput.entity_id)
        .order("occurred_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { data, error: "" };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// ─── Assign a WhatsApp post to an admin ──────────────────────────────────────

export const assignPost = actionClient
  .inputSchema(AssignPostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("scheduled_posts")
        .update({ assigned_to_email: parsedInput.assigned_to_email })
        .eq("id", parsedInput.id);
      if (error) throw new Error(error.message);

      await logAudit(
        supabase,
        "scheduled_post",
        parsedInput.id,
        "assign",
        parsedInput.assigned_to_email ?? "unassigned",
      );

      // Notify the new assignee — skip if clearing assignment or assigning to self
      if (
        parsedInput.assigned_to_email &&
        parsedInput.assigned_to_email !== currentUser?.email
      ) {
        const { createServiceClient } = await import("@/utils/supabase/serviceRole");
        const adminClient = createServiceClient();

        const { data: authData } = await adminClient.auth.admin.listUsers();
        const assigneeUser = authData?.users.find(
          (u) => u.email === parsedInput.assigned_to_email,
        );

        if (assigneeUser) {
          const { data: post } = await supabase
            .from("scheduled_posts")
            .select("post_type, scheduled_date, time_slot")
            .eq("id", parsedInput.id)
            .single();

          if (post) {
            await adminClient.from("notifications").insert({
              user_id: assigneeUser.id,
              type: "post_assigned",
              title: "Post assigned to you",
              body: `${post.post_type} post on ${post.scheduled_date} (${post.time_slot}) has been assigned to you.`,
              entity_type: "scheduled_post",
              entity_id: parsedInput.id,
            });
          }
        }
      }

      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Post assigned." };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to assign post.",
      };
    }
  });

// ─── Fetch all admin users (for assignment dropdown) ─────────────────────────

export const fetchAdminUsers = actionClient
  .inputSchema(z.object({}))
  .action(async () => {
    try {
      const { createServiceClient } = await import("@/utils/supabase/serviceRole");
      const adminClient = createServiceClient();
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) throw new Error(error.message);
      return {
        users: data.users
          .filter((u) => !!u.email)
          .map((u) => ({ id: u.id, email: u.email! })),
        error: "",
      };
    } catch (err) {
      return {
        users: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// ─── Fetch current authenticated user ────────────────────────────────────────

export const fetchCurrentUser = actionClient
  .inputSchema(z.object({}))
  .action(async () => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return { email: user?.email ?? null, error: "" };
    } catch (err) {
      return { email: null, error: err instanceof Error ? err.message : String(err) };
    }
  });

// ─── Delete a post ────────────────────────────────────────────────────────────

export const deleteScheduledPost = actionClient
  .inputSchema(DeletePostZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("scheduled_posts")
        .delete()
        .eq("id", parsedInput.id);
      if (error) throw new Error(error.message);
      await logAudit(supabase, "scheduled_post", parsedInput.id, "delete");
      return { error: "", status: ResponseCodes.SUCCESS, statusText: "Post deleted." };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to delete post.",
      };
    }
  });

// ─── Fetch all posts for an event ─────────────────────────────────────────────

export const fetchPostsForEvent = actionClient
  .inputSchema(FetchPostsZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("scheduled_posts")
        .select("*")
        .eq("event_id", parsedInput.event_id)
        .order("scheduled_at", { ascending: true });
      if (error) throw new Error(error.message);
      return { data, error: "" };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// ─── Fetch campaign for an event ──────────────────────────────────────────────

export const fetchCampaignForEvent = actionClient
  .inputSchema(FetchCampaignZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("post_campaigns")
        .select("*")
        .eq("event_id", parsedInput.event_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { data, error: "" };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// ─── Fetch all posts across all events (global calendar) ─────────────────────

export const fetchAllScheduledPosts = actionClient
  .inputSchema(z.object({}))
  .action(async () => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("scheduled_posts")
        .select("*, events(id, title, start_date, end_date, is_recurring)")
        .order("scheduled_at", { ascending: true });
      if (error) throw new Error(error.message);
      return { data, error: "" };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// ─── Fetch logs for a post ────────────────────────────────────────────────────

export const fetchPostLogs = actionClient
  .inputSchema(z.object({ post_id: z.coerce.number() }))
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("post_logs")
        .select("*")
        .eq("post_id", parsedInput.post_id)
        .order("timestamp", { ascending: false });
      if (error) throw new Error(error.message);
      return { data, error: "" };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

// ─── Regenerate schedule (after event edit) ───────────────────────────────────

export const regenerateSchedule = actionClient
  .inputSchema(RegenerateScheduleZod)
  .action(async ({ parsedInput }) => {
    try {
      const supabase = await createClient();

      // Delete all non-posted posts for this campaign
      await supabase
        .from("scheduled_posts")
        .delete()
        .eq("campaign_id", parsedInput.campaign_id)
        .not("status", "in", '("posted")');

      // Fetch remaining posts (posted ones) to avoid slot conflicts when re-inserting
      const { data: remainingPosts } = await supabase
        .from("scheduled_posts")
        .select("*")
        .eq("campaign_id", parsedInput.campaign_id);

      // Fetch event and regenerate
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("*")
        .eq("id", parsedInput.event_id)
        .single();
      if (eventError || !event) throw new Error(eventError?.message ?? "Event not found.");

      const todayStr = getTodayET();
      const eventDateStr = new Date(event.start_date).toISOString().split("T")[0];
      const drafts = generateDefaultSchedule(eventDateStr, todayStr);

      const working = [...(remainingPosts ?? [])];
      const resolvedDrafts = [];

      for (const draft of drafts) {
        const resolved = resolveSlotCollision(
          working as never,
          draft.scheduled_date,
          draft.time_slot,
          parsedInput.event_id,
        );
        if (!resolved) continue;
        const finalDraft = {
          ...draft,
          scheduled_date: resolved.date,
          time_slot: resolved.slot,
          scheduled_at: resolveScheduledAt(resolved.date, resolved.slot),
          campaign_id: parsedInput.campaign_id,
          event_id: parsedInput.event_id,
          status: "draft" as const,
        };
        resolvedDrafts.push(finalDraft);
        working.push(finalDraft as never);
      }

      if (resolvedDrafts.length > 0) {
        const { error: insertError } = await supabase.from("scheduled_posts").insert(resolvedDrafts);
        if (insertError) throw new Error(insertError.message);
      }

      revalidatePath(`/dashboard/events/${parsedInput.event_id}/posts`);
      return {
        error: "",
        status: ResponseCodes.SUCCESS,
        statusText: `Schedule regenerated with ${resolvedDrafts.length} posts.`,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        status: ResponseCodes.SERVER_ERROR,
        statusText: "Failed to regenerate schedule.",
      };
    }
  });
