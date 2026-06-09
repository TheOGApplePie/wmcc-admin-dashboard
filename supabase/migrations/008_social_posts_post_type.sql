-- 008: Add post_type to social_posts
-- Distinguishes Announcements (event news), General (regular content), and Reminders (event nudges).
-- Defaults to GENERAL so existing rows stay valid without data backfill.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'GENERAL'
    CONSTRAINT social_posts_post_type_check
    CHECK (post_type IN ('ANNOUNCEMENT', 'GENERAL', 'REMINDER'));
