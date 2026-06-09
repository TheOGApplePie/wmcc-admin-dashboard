import { SupabaseClient } from "@supabase/supabase-js";

// TODO: Audit trail — planned for full feature development.
// Upcoming scope:
//   - Role-based visibility: super-admins see all logs; regular admins see their own entity logs.
//   - Extend entity coverage: social_posts, announcements, user management, community feedback.
//   - UI: dedicated Audit Log page with per-entity drill-down, filterable by user, action, date range.
//   - Permissions hierarchy: who can view logs, who can export them.
// See supabase/migrations/004_audit_log.sql for the current DB schema.

export async function logAudit(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string | number,
  action: string,
  detail?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    user_email: user.email ?? null,
    entity_type: entityType,
    entity_id: String(entityId),
    action,
    detail: detail ?? null,
  });
}
