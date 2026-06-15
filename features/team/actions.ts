"use server";

import { createSafeActionClient } from "next-safe-action";
import { createClient } from "@/utils/supabase/server";
// Service role is required for Supabase admin invite API (auth.admin.inviteUserByEmail).
// Server actions are purely server-side ("use server"), so this is safe.
import { createServiceClient } from "@/utils/supabase/serviceRole";
import { revalidatePath } from "next/cache";
import z from "zod";

const actionClient = createSafeActionClient();

const Role = z.enum(["board", "management", "volunteer"]);
const Override = z.record(z.string().regex(/^[a-z]+\.[a-z]+$/), z.boolean());

/** Throws if the current user lacks the given permission. */
async function requirePerm(module: string, action: string) {
  const supabase = await createClient();
  const { data: granted } = await supabase.rpc("has_perm", {
    p_module: module,
    p_action: action,
  });
  if (!granted) throw new Error(`Permission denied: ${module}.${action}`);
}

// ── Invite ─────────────────────────────────────────────────────────────────────

export const inviteMember = actionClient
  .inputSchema(
    z.object({
      email: z.string().email("Enter a valid email address."),
      role: Role,
      area: z.string().max(60).optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    await requirePerm("users", "manage");

    const serviceClient = createServiceClient();

    // Reject if a profile already exists for this email
    const { data: existing } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("email", parsedInput.email)
      .maybeSingle();

    if (existing) {
      return { error: "A team member with this email already exists." };
    }

    // Create the auth user and send the invite email
    const {
      data: { user },
      error: inviteError,
    } = await serviceClient.auth.admin.inviteUserByEmail(parsedInput.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
    });

    if (inviteError || !user) {
      return { error: inviteError?.message ?? "Failed to send invite." };
    }

    // Insert the profile row (service role bypasses RLS)
    const { error: profileError } = await serviceClient.from("profiles").insert({
      id: user.id,
      email: parsedInput.email,
      display_name: parsedInput.email.split("@")[0],
      role: parsedInput.role,
      area: parsedInput.area ?? null,
      status: "invited",
    });

    if (profileError) {
      return { error: profileError.message };
    }

    revalidatePath("/dashboard/users-management");
  });

// ── Update member ──────────────────────────────────────────────────────────────

export const updateMember = actionClient
  .inputSchema(
    z.object({
      id: z.string().uuid(),
      role: Role,
      area: z.string().max(60).nullable().optional(),
      permission_overrides: Override,
    }),
  )
  .action(async ({ parsedInput }) => {
    await requirePerm("users", "manage");

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        role: parsedInput.role,
        ...(parsedInput.area !== undefined ? { area: parsedInput.area } : {}),
        permission_overrides: parsedInput.permission_overrides,
      })
      .eq("id", parsedInput.id);

    if (error) return { error: error.message };
    revalidatePath("/dashboard/users-management");
  });

// ── Reset overrides ────────────────────────────────────────────────────────────

export const resetToPreset = actionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await requirePerm("users", "manage");

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ permission_overrides: {} })
      .eq("id", parsedInput.id);

    if (error) return { error: error.message };
    revalidatePath("/dashboard/users-management");
  });

// ── Deactivate / Reactivate ────────────────────────────────────────────────────

export const deactivateMember = actionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await requirePerm("users", "delete");

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ status: "inactive" })
      .eq("id", parsedInput.id);

    if (error) return { error: error.message };
    revalidatePath("/dashboard/users-management");
  });

export const reactivateMember = actionClient
  .inputSchema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    await requirePerm("users", "manage");

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ status: "active" })
      .eq("id", parsedInput.id);

    if (error) return { error: error.message };
    revalidatePath("/dashboard/users-management");
  });

// ── Resend invite ──────────────────────────────────────────────────────────────

export const resendInvite = actionClient
  .inputSchema(z.object({ email: z.string().email() }))
  .action(async ({ parsedInput }) => {
    await requirePerm("users", "manage");

    const serviceClient = createServiceClient();
    const { error } = await serviceClient.auth.admin.inviteUserByEmail(
      parsedInput.email,
      {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback`,
      },
    );

    if (error) return { error: error.message };
  });
