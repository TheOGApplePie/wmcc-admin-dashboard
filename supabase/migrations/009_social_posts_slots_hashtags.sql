-- 009: Social posts — time slots, hashtags, assignment, and notification support
--
-- Adds:
--   time_slot     — morning | afternoon | evening (max 3 posts per day, soft-warned)
--   hashtags      — TEXT[] for Instagram Feed hashtags (max 30, stored normalised)
--   assigned_to   — UUID of admin responsible for marking the post as sent
--   last_notified_at — rate-limits overdue "mark as sent" notifications to 48 h
--
-- Notifications:
--   Widens entity_id to TEXT so UUID-keyed social_posts rows fit alongside
--   the existing BIGINT-keyed scheduled_posts rows.

-- ── social_posts additions ────────────────────────────────────────────────────

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS time_slot TEXT
    CONSTRAINT social_posts_time_slot_check
    CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  ADD COLUMN IF NOT EXISTS hashtags         TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_to      UUID      REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_social_posts_overdue_notify
  ON social_posts (scheduled_at, status, last_notified_at)
  WHERE status = 'scheduled';

-- ── notifications: widen entity_id from BIGINT to TEXT ───────────────────────
-- Existing scheduled_post bigint ids are preserved as text ("123", "456" …).
-- New social_post UUID ids are stored as text directly.

ALTER TABLE notifications
  ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;
