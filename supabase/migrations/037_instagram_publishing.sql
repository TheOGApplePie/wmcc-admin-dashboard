-- The existing social-post RPCs already handle claiming, pending containers,
-- completion, and recovery. Only persistent refreshed credentials are new.
BEGIN;
-- Tokens are encrypted by the app; authenticated clients have no access.
CREATE TABLE instagram_credentials (
 account_id text PRIMARY KEY,
 encrypted_token text NOT NULL,
 seed_fingerprint text NOT NULL,
 expires_at timestamptz NOT NULL,
 refreshed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE instagram_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON instagram_credentials FROM PUBLIC,anon,authenticated;
GRANT ALL ON instagram_credentials TO service_role;
COMMIT;
