import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import type { ViewerAccess } from "./types";

const ViewerAccessSchema = z.object({
  profile: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    role: z.enum(["board", "management", "general"]),
    status: z.enum(["invited", "active", "inactive"]),
  }).nullable(),
  permissions: z.record(z.string(), z.boolean()),
});

export const getViewerAccess = cache(async (): Promise<ViewerAccess> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("get_my_access");
  if (error) throw new Error(`Unable to resolve dashboard access: ${error.message}`);
  const parsed = ViewerAccessSchema.safeParse(data);
  if (!parsed.success) throw new Error("Dashboard access response is invalid.");
  return parsed.data;
});

export async function requireViewerPermission(module: string, action: string) {
  const access = await getViewerAccess();
  const permission = `${module}.${action}`;
  if (!access.permissions[permission]) {
    redirect(`/dashboard/access-denied?permission=${encodeURIComponent(permission)}`);
  }
  return access;
}
