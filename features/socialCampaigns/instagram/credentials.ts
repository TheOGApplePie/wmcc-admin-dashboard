import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createServiceClient } from "@/utils/supabase/serviceRole";

import { getInstagramConfig } from "./config";

function encryptionKey() {
  const key = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("Set INSTAGRAM_TOKEN_ENCRYPTION_KEY to a 32-byte hex key.");
  return Buffer.from(key, "hex");
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64"))
    .join(".");
}

export function decryptToken(value: string): string {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  if (!iv || !tag || !ciphertext)
    throw new Error("Invalid encrypted Instagram credential.");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString(
    "utf8",
  );
}

export async function getInstagramCredential() {
  const { accountId, seed, prefix } = getInstagramConfig();
  if (!accountId || !seed)
    throw new Error(`${prefix}_ACCOUNT_ID and ${prefix}_ACCESS_TOKEN are required.`);
  const fingerprint = createHash("sha256").update(seed).digest("hex");
  const db = createServiceClient();
  const { data, error } = await db
    .from("instagram_credentials")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error)
    throw new Error(
      "Unable to read Instagram credentials. Apply migration 037.",
    );
  const stored = data?.seed_fingerprint === fingerprint ? data : null;
  return {
    accountId,
    fingerprint,
    db,
    token: stored ? decryptToken(stored.encrypted_token) : seed,
    expiresAt:
      stored?.expires_at ?? null,
    refreshedAt: stored?.refreshed_at ?? null,
  };
}
