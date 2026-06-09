-- ─── Social Posts — Phase 1 ──────────────────────────────────────────────────
--
-- Creates the social_posts table for planning, scheduling, and manually tracking
-- social media posts across Instagram Feed, Instagram Story, and WhatsApp.
--
-- Phase 1: no live publishing. Posts are drafted/scheduled and admins confirm
-- publication manually. The publishPost() server action is a stub seam for Phase 2.
--
-- Phase 2 prerequisites (see INTEGRATIONS.md):
--   - Instagram Graph API (ig_feed, ig_story)
--   - WhatsApp Business Cloud API (whatsapp)
--
-- Storage: create a bucket named 'social-media' in the Supabase dashboard
--   Settings → Storage → New bucket
--   Public: true
--   Allowed MIME types: image/jpeg, image/png, image/webp, video/mp4
--   Max upload size: 10 MB

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE social_channel AS ENUM ('ig_feed', 'ig_story', 'whatsapp');
CREATE TYPE social_post_status AS ENUM ('idea', 'draft', 'scheduled', 'published', 'failed');

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE social_posts (
  id           UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT                NOT NULL,
  caption      TEXT                NOT NULL DEFAULT '',
  channels     social_channel[]    NOT NULL DEFAULT '{}',
  status       social_post_status  NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  media_url    TEXT,
  event_id     BIGINT              REFERENCES events(id) ON DELETE SET NULL,
  created_by   UUID                NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ── Indices ───────────────────────────────────────────────────────────────────

CREATE INDEX ON social_posts (status, scheduled_at);
CREATE INDEX ON social_posts (created_by, created_at DESC);
CREATE INDEX ON social_posts (event_id) WHERE event_id IS NOT NULL;

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_social_posts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION trg_social_posts_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

-- Any authenticated admin can read all posts
CREATE POLICY "Admins can view all social posts"
  ON social_posts FOR SELECT TO authenticated
  USING (true);

-- Creator is set from auth.uid() in the action; enforced here too
CREATE POLICY "Admins can create social posts"
  ON social_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Any admin can update any post (team collaboration)
CREATE POLICY "Admins can update any social post"
  ON social_posts FOR UPDATE TO authenticated
  USING (true);

-- Any admin can delete any post
CREATE POLICY "Admins can delete any social post"
  ON social_posts FOR DELETE TO authenticated
  USING (true);
