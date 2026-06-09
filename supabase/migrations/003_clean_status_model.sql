-- Collapse confirmed → draft (confirmed is an intermediate state we no longer need)
-- Redefine scheduled as the admin-confirmed, cron-eligible state
UPDATE scheduled_posts SET status = 'draft' WHERE status = 'confirmed';

-- Rebuild post_status enum without 'confirmed'
ALTER TYPE post_status RENAME TO post_status_old;
CREATE TYPE post_status AS ENUM ('draft', 'scheduled', 'posted', 'failed');

ALTER TABLE scheduled_posts
  ALTER COLUMN status TYPE post_status
  USING status::text::post_status;

ALTER TABLE post_logs
  ALTER COLUMN status TYPE post_status
  USING status::text::post_status;

DROP TYPE post_status_old;

-- Rebuild retry index: was filtered on 'confirmed', now filter on 'scheduled'
DROP INDEX IF EXISTS idx_sp_retry;
CREATE INDEX idx_sp_retry ON scheduled_posts(next_retry_at, status)
  WHERE status = 'scheduled' AND next_retry_at IS NOT NULL;
