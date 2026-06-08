import { SupabaseClient } from "@supabase/supabase-js";

export async function logAudit(
  supabase: SupabaseClient,
  entityType: string,
  entityId: number,
  action: string,
  detail?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("audit_logs").insert({
    user_id: user.id,
    user_email: user.email ?? null,
    entity_type: entityType,
    entity_id: entityId,
    action,
    detail: detail ?? null,
  });
}
