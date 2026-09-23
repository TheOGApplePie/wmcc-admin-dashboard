-- 012: Campaign-based social planning foundation.
-- Additive: existing social_posts rows remain valid and can be migrated later.

CREATE TYPE social_campaign_type AS ENUM ('standalone', 'event', 'recurring_event');
CREATE TYPE social_campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');
CREATE TYPE social_occurrence_kind AS ENUM ('standalone', 'initial', 'reminder', 'optional_reel');
CREATE TYPE social_variant_channel AS ENUM (
  'instagram_feed', 'instagram_story', 'instagram_reel', 'whatsapp', 'tiktok_reel'
);
CREATE TYPE social_schedule_platform AS ENUM ('instagram', 'whatsapp', 'tiktok');
CREATE TYPE social_delivery_status AS ENUM (
  'draft', 'proposed', 'scheduled', 'due', 'processing', 'sent', 'failed', 'skipped', 'cancelled'
);
CREATE TYPE social_delivery_method AS ENUM ('manual', 'automated');

CREATE TABLE social_campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description         TEXT NOT NULL DEFAULT '',
  campaign_type       social_campaign_type NOT NULL,
  event_id             BIGINT REFERENCES events(id) ON DELETE SET NULL,
  status              social_campaign_status NOT NULL DEFAULT 'draft',
  needs_review        BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason       TEXT,
  starts_on           DATE,
  ends_on             DATE,
  default_channels    social_variant_channel[] NOT NULL DEFAULT '{}',
  default_assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_snapshot      JSONB NOT NULL DEFAULT '{}',
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_campaign_event_shape CHECK (
    (campaign_type = 'standalone' AND event_id IS NULL)
    OR (campaign_type IN ('event', 'recurring_event') AND (event_id IS NOT NULL OR needs_review))
  ),
  CONSTRAINT social_campaign_date_order CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE social_campaign_occurrences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES social_campaigns(id) ON DELETE CASCADE,
  kind                social_occurrence_kind NOT NULL,
  milestone_days      SMALLINT,
  event_occurrence_at TIMESTAMPTZ,
  target_date         DATE NOT NULL,
  sequence            INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  generation_key      TEXT NOT NULL,
  generated           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, generation_key)
);

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES social_campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campaign_occurrence_id UUID REFERENCES social_campaign_occurrences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS call_to_action_link TEXT,
  ADD COLUMN IF NOT EXISTS call_to_action_caption TEXT;

CREATE TABLE social_post_variants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id              UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  channel              social_variant_channel NOT NULL,
  caption              TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  hashtags             TEXT[] NOT NULL DEFAULT '{}',
  media_url             TEXT,
  cover_media_url       TEXT,
  overlay_text          TEXT,
  call_to_action_link   TEXT,
  call_to_action_caption TEXT,
  configuration         JSONB NOT NULL DEFAULT '{}',
  validation_errors     JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, channel),
  CONSTRAINT social_variant_media_https CHECK (media_url IS NULL OR media_url ~ '^https://'),
  CONSTRAINT social_variant_cover_https CHECK (cover_media_url IS NULL OR cover_media_url ~ '^https://'),
  CONSTRAINT social_variant_cta_https CHECK (call_to_action_link IS NULL OR call_to_action_link ~ '^https://')
);

CREATE TABLE social_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id        UUID NOT NULL REFERENCES social_post_variants(id) ON DELETE CASCADE,
  schedule_platform social_schedule_platform NOT NULL,
  scheduled_date    DATE,
  time_slot         time_slot,
  scheduled_at      TIMESTAMPTZ,
  status            social_delivery_status NOT NULL DEFAULT 'draft',
  assigned_to       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  delivery_method   social_delivery_method NOT NULL DEFAULT 'manual',
  sent_at           TIMESTAMPTZ,
  sent_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  external_id       TEXT,
  external_url      TEXT,
  provider_error    TEXT,
  attempt_count     SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at   TIMESTAMPTZ,
  idempotency_key   TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key),
  CONSTRAINT social_delivery_schedule_shape CHECK (
    (status IN ('draft', 'proposed', 'cancelled') AND scheduled_at IS NULL)
    OR (status NOT IN ('draft', 'proposed', 'cancelled') AND scheduled_date IS NOT NULL AND time_slot IS NOT NULL AND scheduled_at IS NOT NULL)
  ),
  CONSTRAINT social_delivery_sent_shape CHECK (
    (status IN ('sent', 'skipped') AND sent_at IS NOT NULL AND sent_by IS NOT NULL)
    OR (status NOT IN ('sent', 'skipped'))
  ),
  CONSTRAINT social_delivery_external_https CHECK (external_url IS NULL OR external_url ~ '^https://')
);

CREATE UNIQUE INDEX social_deliveries_slot_unique
  ON social_deliveries (schedule_platform, scheduled_date, time_slot)
  WHERE status IN ('scheduled', 'due', 'processing');
CREATE INDEX social_campaigns_event_idx ON social_campaigns(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX social_occurrences_campaign_date_idx ON social_campaign_occurrences(campaign_id, target_date);
CREATE INDEX social_posts_campaign_idx ON social_posts(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX social_deliveries_due_idx ON social_deliveries(status, scheduled_at);

CREATE OR REPLACE FUNCTION set_social_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER social_campaigns_updated_at BEFORE UPDATE ON social_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_social_updated_at();
CREATE TRIGGER social_post_variants_updated_at BEFORE UPDATE ON social_post_variants
  FOR EACH ROW EXECUTE FUNCTION set_social_updated_at();
CREATE TRIGGER social_deliveries_updated_at BEFORE UPDATE ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_social_updated_at();

CREATE OR REPLACE FUNCTION guard_sent_social_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('sent', 'skipped') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Sent or skipped social deliveries are immutable.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_sent_immutable BEFORE UPDATE ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION guard_sent_social_delivery();

CREATE OR REPLACE FUNCTION guard_social_delivery_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('sent', 'skipped', 'processing', 'failed')
       AND NOT has_perm('social', 'send') THEN
      RAISE EXCEPTION 'Permission denied: social.send';
    END IF;
    IF (NEW.status IN ('scheduled', 'cancelled') OR OLD.status = 'scheduled')
       AND NOT has_perm('social', 'schedule') THEN
      RAISE EXCEPTION 'Permission denied: social.schedule';
    END IF;
  END IF;

  IF ROW(NEW.scheduled_date, NEW.time_slot, NEW.scheduled_at)
     IS DISTINCT FROM ROW(OLD.scheduled_date, OLD.time_slot, OLD.scheduled_at)
     AND NOT has_perm('social', 'schedule') THEN
    RAISE EXCEPTION 'Permission denied: social.schedule';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_transition_guard BEFORE UPDATE ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION guard_social_delivery_transition();

CREATE OR REPLACE FUNCTION guard_social_campaign_review_clear()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.needs_review AND NOT NEW.needs_review
     AND auth.role() <> 'service_role'
     AND NOT has_perm('social', 'override') THEN
    RAISE EXCEPTION 'Permission denied: social.override';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_campaign_review_clear_guard BEFORE UPDATE OF needs_review ON social_campaigns
  FOR EACH ROW EXECUTE FUNCTION guard_social_campaign_review_clear();

CREATE OR REPLACE FUNCTION guard_sent_social_variant()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM social_deliveries
    WHERE variant_id = OLD.id AND status IN ('sent', 'skipped')
  ) THEN
    RAISE EXCEPTION 'A delivered social post variant is immutable.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER social_variants_sent_immutable BEFORE UPDATE OR DELETE ON social_post_variants
  FOR EACH ROW EXECUTE FUNCTION guard_sent_social_variant();

ALTER TABLE social_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_campaign_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_campaigns_select ON social_campaigns FOR SELECT USING (has_perm('social', 'view'));
CREATE POLICY social_campaigns_insert ON social_campaigns FOR INSERT WITH CHECK (created_by = auth.uid() AND has_perm('social', 'edit'));
CREATE POLICY social_campaigns_update ON social_campaigns FOR UPDATE USING (has_perm('social', 'edit')) WITH CHECK (has_perm('social', 'edit'));
CREATE POLICY social_campaigns_delete ON social_campaigns FOR DELETE USING (has_perm('social', 'delete'));

CREATE POLICY social_occurrences_select ON social_campaign_occurrences FOR SELECT USING (has_perm('social', 'view'));
CREATE POLICY social_occurrences_insert ON social_campaign_occurrences FOR INSERT WITH CHECK (has_perm('social', 'edit'));
CREATE POLICY social_occurrences_update ON social_campaign_occurrences FOR UPDATE USING (has_perm('social', 'edit')) WITH CHECK (has_perm('social', 'edit'));
CREATE POLICY social_occurrences_delete ON social_campaign_occurrences FOR DELETE USING (has_perm('social', 'delete'));

CREATE POLICY social_variants_select ON social_post_variants FOR SELECT USING (has_perm('social', 'view'));
CREATE POLICY social_variants_insert ON social_post_variants FOR INSERT WITH CHECK (has_perm('social', 'edit'));
CREATE POLICY social_variants_update ON social_post_variants FOR UPDATE USING (has_perm('social', 'edit')) WITH CHECK (has_perm('social', 'edit'));
CREATE POLICY social_variants_delete ON social_post_variants FOR DELETE USING (has_perm('social', 'delete'));

CREATE POLICY social_deliveries_select ON social_deliveries FOR SELECT USING (has_perm('social', 'view'));
CREATE POLICY social_deliveries_insert ON social_deliveries FOR INSERT WITH CHECK (has_perm('social', 'schedule'));
CREATE POLICY social_deliveries_update ON social_deliveries FOR UPDATE USING (has_perm('social', 'schedule') OR has_perm('social', 'send')) WITH CHECK (has_perm('social', 'schedule') OR has_perm('social', 'send'));
CREATE POLICY social_deliveries_delete ON social_deliveries FOR DELETE USING (has_perm('social', 'delete'));

-- Replace the permissive Phase 1 policies on social_posts.
DROP POLICY IF EXISTS "Admins can view all social posts" ON social_posts;
DROP POLICY IF EXISTS "Admins can create social posts" ON social_posts;
DROP POLICY IF EXISTS "Admins can update any social post" ON social_posts;
DROP POLICY IF EXISTS "Admins can delete any social post" ON social_posts;
DROP POLICY IF EXISTS social_permission_insert ON social_posts;
DROP POLICY IF EXISTS social_permission_update ON social_posts;
DROP POLICY IF EXISTS social_permission_delete ON social_posts;
CREATE POLICY social_posts_select_v2 ON social_posts FOR SELECT USING (has_perm('social', 'view'));
CREATE POLICY social_posts_insert_v2 ON social_posts FOR INSERT WITH CHECK (created_by = auth.uid() AND has_perm('social', 'edit'));
CREATE POLICY social_posts_update_v2 ON social_posts FOR UPDATE USING (has_perm('social', 'edit')) WITH CHECK (has_perm('social', 'edit'));
CREATE POLICY social_posts_delete_v2 ON social_posts FOR DELETE USING (has_perm('social', 'delete'));
