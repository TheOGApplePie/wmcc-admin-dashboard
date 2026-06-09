-- ─── Phase 1: Platform simplification + notifications ─────────────────────────
--
-- Changes:
--   1. Drop is_story column (implicit in instagram_story platform)
--   2. Shrink platform enum to: instagram_feed, instagram_story, whatsapp
--   3. Add cross_post_facebook boolean
--   4. Add created_by_email (post author, immutable)
--   5. Broaden assigned_to_email (previously WhatsApp-only, now all posts)
--   6. Add last_notified_at (rate-limits overdue notifications to 48h)
--   7. Create notifications table
--
-- Run order: after 005_whatsapp_manual.sql


-- ── 1. Drop is_story ──────────────────────────────────────────────────────────
ALTER TABLE scheduled_posts DROP COLUMN IF EXISTS is_story;


-- ── 2. Shrink platform enum ───────────────────────────────────────────────────
-- Remove any rows that use the dropped platforms (safety guard).
UPDATE scheduled_posts
  SET platforms = array_remove(array_remove(platforms::text[], 'instagram_reel'), 'facebook_feed')::platform_type[]
  WHERE platforms::text[] && ARRAY['instagram_reel', 'facebook_feed'];

-- If removing those platforms left a post with no platforms, default to instagram_feed.
UPDATE scheduled_posts
  SET platforms = ARRAY['instagram_feed']::platform_type[]
  WHERE array_length(platforms, 1) = 0 OR platforms IS NULL;

-- Rebuild the enum without the removed values.
ALTER TYPE platform_type RENAME TO platform_type_old;
CREATE TYPE platform_type AS ENUM ('instagram_feed', 'instagram_story', 'whatsapp');

ALTER TABLE scheduled_posts
  ALTER COLUMN platforms TYPE platform_type[]
  USING platforms::text[]::platform_type[];

DROP TYPE platform_type_old;


-- ── 3. cross_post_facebook ────────────────────────────────────────────────────
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS cross_post_facebook BOOLEAN NOT NULL DEFAULT FALSE;


-- ── 4. created_by_email (author, set at creation) ─────────────────────────────
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS created_by_email TEXT;


-- ── 5. assigned_to_email already exists from 005; no action needed ────────────
-- The column was added in 005_whatsapp_manual.sql.
-- It is now used for all posts (not WhatsApp-only). No schema change required.


-- ── 6. last_notified_at (48-hour rate limit for overdue notifications) ─────────
ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_overdue_notify
  ON scheduled_posts (scheduled_at, status, last_notified_at)
  WHERE status = 'scheduled';


-- ── 7. Notifications table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,   -- 'post_overdue' | 'post_assigned'
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  entity_type  TEXT        NOT NULL,   -- 'scheduled_post'
  entity_id    BIGINT      NOT NULL,
  read_at      TIMESTAMPTZ,            -- NULL = unread
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Admins can only read/update their own notifications.
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Service role (cron) inserts notifications — no RLS restriction needed for insert
-- because the cron uses the service role key which bypasses RLS.
