import { createClient } from "@/utils/supabase/server";

export async function requirePermission(module: string, action: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated.");

  const { data: granted, error } = await supabase.rpc("has_perm", {
    p_module: module,
    p_action: action,
  });
  if (error) throw new Error(`Unable to verify permission: ${error.message}`);
  if (!granted) throw new Error(`Permission denied: ${module}.${action}`);

  return { supabase, user };
}

export async function hasPermission(module: string, action: string): Promise<boolean> {
  try {
    await requirePermission(module, action);
    return true;
  } catch {
    return false;
  }
}
