"use server";

import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import QRCode from "qrcode";
import { createClient } from "@/utils/supabase/server";
import { requirePermission } from "@/utils/permissions";
import { fail, ok } from "@/utils/actionResponse";

const client = createSafeActionClient();

async function authenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated.");
  return { supabase, user };
}

export const getWhatsAppAccount = client.action(async () => {
  try {
    const { supabase, user } = await authenticatedClient();
    const { data, error } = await supabase
      .from("whatsapp_accounts")
      .select("whatsapp_jid,paired_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error)
      throw new Error(
        "Unable to load your WhatsApp account. Check that the ownership migration is applied.",
      );
    return ok(data as { whatsapp_jid: string; paired_at: string } | null);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
});

export const whatsappSession = client
  .inputSchema(z.object({ operation: z.enum(["start", "poll", "remove"]) }))
  .action(async ({ parsedInput: { operation } }) => {
    try {
      const { supabase } =
        operation === "remove"
          ? await authenticatedClient()
          : await requirePermission("social", "publish");
      const baseUrl = process.env.WHATSAPP_SERVICE_URL;
      if (!baseUrl)
        throw new Error(
          "WhatsApp pairing is not configured. Set WHATSAPP_SERVICE_URL.",
        );
      // getUser above verifies identity; forward the current user's token only to the configured service.
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session)
        throw new Error("Your login expired. Sign in again.");
      const response = await fetch(new URL("/api/whatsapp/session", baseUrl), {
        method:
          operation === "start"
            ? "POST"
            : operation === "remove"
              ? "DELETE"
              : "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "application/json, text/plain",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.text();
      let payload;
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        if (
          response.ok &&
          operation === "start" &&
          response.headers.get("content-type")?.includes("text/plain")
        )
          payload = body;
        else
          throw new Error(
            `WhatsApp service returned an invalid response (HTTP ${response.status}).`,
          );
      }
      if (typeof payload === "string" && operation === "start")
        payload = { status: "connecting", qr: payload };
      if (!payload || typeof payload !== "object")
        throw new Error(
          "WhatsApp service returned an invalid session response.",
        );
      if (!response.ok)
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : `WhatsApp service returned HTTP ${response.status}.`,
        );
      if (operation === "remove") {
        // Release even if the service reports that WhatsApp logout could not be confirmed.
        // If the request itself failed, keep the claim and offer retry.
        const { error: releaseError } = await supabase.rpc(
          "release_whatsapp_account",
        );
        if (releaseError)
          throw new Error(
            "Session removed, but releasing the account failed. Retry removal.",
          );
        return ok({ status: "removed", qr: null, reason: null });
      }
      const rawQr = payload.qr ?? payload.qrCode;
      const status =
        typeof payload.status === "string"
          ? payload.status
          : operation === "start" && typeof rawQr === "string" && rawQr
            ? "connecting"
            : null;
      if (!status)
        throw new Error(
          "WhatsApp service returned an invalid session response.",
        );
      let qr: string | null = null;
      if (typeof rawQr === "string" && rawQr) {
        qr = rawQr.startsWith("data:image/png;base64,")
          ? rawQr
          : await QRCode.toDataURL(rawQr, { width: 320, margin: 2 });
      }
      return ok({
        status,
        qr,
        reason: typeof payload.reason === "string" ? payload.reason : null,
      });
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "Unable to reach the WhatsApp service.",
      );
    }
  });
