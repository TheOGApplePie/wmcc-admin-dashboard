-- Add next_retry_at to scheduled_posts for precise retry scheduling
ALTER TABLE scheduled_posts
  ADD COLUMN next_retry_at TIMESTAMPTZ;

-- Index for the cron handler to efficiently find posts due for retry
CREATE INDEX idx_sp_retry ON scheduled_posts(next_retry_at, status)
  WHERE status = 'confirmed' AND next_retry_at IS NOT NULL;
