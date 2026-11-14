import { createClient } from "@/utils/supabase/server";
import { TeamPage } from "@/features/team";
import type { Profile } from "@/features/team/types";
import { requireViewerPermission } from "@/features/access/server";

export default async function UsersManagement({ searchParams }: Readonly<{ searchParams: Promise<{ q?: string; page?: string }> }>) {
  await requireViewerPermission("users", "view");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 200);
  const page = Math.min(100000, Math.max(1, Math.floor(Number(params.page) || 1)));
  let query = supabase.from("profiles").select("id,display_name,email,avatar_path,role,status,area,permission_overrides,notification_prefs,last_active_at,invited_by,joined_at,created_at", { count: "exact" });
  // Quote PostgREST values so search punctuation cannot introduce extra filters.
  if (q) {
    const pattern = JSON.stringify(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
    query = query.or(`display_name.ilike.${pattern},email.ilike.${pattern},area.ilike.${pattern}`);
  }
  const count = (column: string, value: string) => supabase.from("profiles").select("id", { count: "exact", head: true }).eq(column, value);
  const [members, viewer, active, board, management, invited] = await Promise.all([
    query.order("role").order("display_name").order("id").range((page - 1) * 50, page * 50 - 1).returns<Profile[]>(),
    user ? supabase.from("profiles").select("id").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    count("status", "active"), count("role", "board"), count("role", "management"), count("status", "invited"),
  ]);
  for (const result of [members, viewer, active, board, management, invited]) if (result.error) throw new Error(result.error.message);
  return <TeamPage key={`${q}:${page}`} profiles={members.data ?? []} currentUserId={viewer.data?.id ?? null}
    stats={{ active: active.count ?? 0, board: board.count ?? 0, management: management.count ?? 0, invited: invited.count ?? 0 }}
    query={q} page={page} total={members.count ?? 0} />;
}
