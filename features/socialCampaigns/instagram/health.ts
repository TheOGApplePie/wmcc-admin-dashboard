import {
  encryptToken,
  getInstagramCredential,
} from "./credentials";

export class InstagramHealthError extends Error {}

async function request(
  path: string,
  token: string,
  params: Record<string, string> = {},
) {
  const url = new URL(path, "https://graph.instagram.com");
  for (const [key, value] of Object.entries({ ...params, access_token: token }))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.error)
    throw new InstagramHealthError(
      "Instagram rejected a health or refresh request. Verify token validity and permissions in Meta.",
    );
  return payload;
}

export async function checkInstagramHealth() {
  const credential = await getInstagramCredential();
  const version = process.env.META_GRAPH_API_VERSION;
  if (!version || !/^v\d+\.\d+$/.test(version))
    throw new InstagramHealthError(
      "Configure META_GRAPH_API_VERSION using a supported version from the Meta dashboard.",
    );
  const account = await request(
    `/${version}/${credential.accountId}`,
    credential.token,
    { fields: "id,username" },
  );
  if (!account.id)
    throw new InstagramHealthError(
      "Instagram did not confirm the configured account.",
    );
  // Read-only request verifies access to the publishing endpoint without posting.
  await request(
    `/${version}/${credential.accountId}/content_publishing_limit`,
    credential.token,
    { fields: "quota_usage,config" },
  );
  let expiresAt: string | null = credential.expiresAt;
  let refreshed = false;
  if (
    !credential.refreshedAt ||
      Date.now() - Date.parse(credential.refreshedAt) >= 7 * 86_400_000
  ) {
    // Refresh only long-lived, unexpired Instagram Login tokens. A revoked or
    // short-lived token must be replaced through Meta; never silently claim health.
    if (!process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY)
      throw new InstagramHealthError(
        "Configure INSTAGRAM_TOKEN_ENCRYPTION_KEY before enabling automatic token refresh.",
      );
    const payload = await request("/refresh_access_token", credential.token, {
      grant_type: "ig_refresh_token",
    });
    if (
      typeof payload.access_token !== "string" ||
      !payload.access_token ||
      !Number.isFinite(payload.expires_in) ||
      payload.expires_in <= 0
    ) {
      throw new InstagramHealthError(
        "Instagram did not confirm token refresh and expiry.",
      );
    }
    expiresAt = new Date(Date.now() + payload.expires_in * 1000).toISOString();
    const { error } = await credential.db.from("instagram_credentials").upsert({
      account_id: credential.accountId,
      encrypted_token: encryptToken(payload.access_token),
      seed_fingerprint: credential.fingerprint,
      expires_at: expiresAt,
      refreshed_at: new Date().toISOString(),
    });
    if (error)
      throw new InstagramHealthError(
        "Unable to save the refreshed Instagram token.",
      );
    refreshed = true;
  }
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  const warning = !Number.isFinite(expiry)
    ? "Token expiry is unknown. Verify the connection in Meta."
    : expiry <= Date.now() + 14 * 86_400_000
      ? "Instagram token expires within 14 days or has expired. Reconnect or rotate the token."
      : null;
  return { accountId: credential.accountId, refreshed, expiresAt, warning };
}
