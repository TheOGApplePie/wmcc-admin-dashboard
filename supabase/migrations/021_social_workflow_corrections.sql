-- 021: Keep social publishing slots fixed in UTC and persist carousel media
-- atomically with manual post creation.

-- This is the canonical slot-to-instant conversion. A posting date is a
-- business date; its three slots are fixed UTC instants that correspond to
-- 9 AM, 2 PM, and 7 PM EST. The UI may render those instants in local time.
CREATE OR REPLACE FUNCTION social_slot_scheduled_at(
  p_scheduled_date DATE,
  p_time_slot time_slot
)
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE STRICT
SET search_path = public
AS $$
  SELECT (
    p_scheduled_date::TIMESTAMP + CASE p_time_slot
      WHEN 'morning' THEN INTERVAL '14 hours'
      WHEN 'afternoon' THEN INTERVAL '19 hours'
      ELSE INTERVAL '24 hours'
    END
  ) AT TIME ZONE 'UTC';
$$;

CREATE OR REPLACE FUNCTION create_manual_social_post(
  p_campaign_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_scheduled_date DATE,
  p_time_slot time_slot,
  p_mode TEXT,
  p_variants JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign social_campaigns%ROWTYPE;
  v_occurrence_id UUID;
  v_post_id UUID;
  v_variant_id UUID;
  v_item JSONB;
  v_channel social_variant_channel;
  v_platform social_schedule_platform;
  v_scheduled_at TIMESTAMPTZ;
BEGIN
  IF NOT has_perm('social', 'edit') THEN RAISE EXCEPTION 'Permission denied: social.edit'; END IF;
  IF p_mode NOT IN ('draft', 'scheduled') THEN RAISE EXCEPTION 'Invalid post mode.'; END IF;
  IF p_mode = 'scheduled' AND NOT has_perm('social', 'schedule') THEN RAISE EXCEPTION 'Permission denied: social.schedule'; END IF;
  IF jsonb_array_length(COALESCE(p_variants, '[]'::JSONB)) <> 1 THEN RAISE EXCEPTION 'Select exactly one platform.'; END IF;

  IF p_mode = 'scheduled' AND (p_scheduled_date IS NULL OR p_time_slot IS NULL) THEN
    RAISE EXCEPTION 'A date and time slot are required to schedule a post.';
  END IF;

  SELECT * INTO v_campaign FROM social_campaigns WHERE id = p_campaign_id AND status NOT IN ('completed', 'archived');
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found or no longer accepts posts.'; END IF;

  v_scheduled_at := CASE WHEN p_mode = 'scheduled'
    THEN social_slot_scheduled_at(p_scheduled_date, p_time_slot)
    ELSE NULL
  END;

  IF p_mode = 'scheduled' AND v_scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Choose a future time slot before scheduling.';
  END IF;

  IF p_mode = 'scheduled' AND (
    (v_campaign.starts_on IS NOT NULL AND p_scheduled_date < v_campaign.starts_on)
    OR (v_campaign.ends_on IS NOT NULL AND p_scheduled_date > v_campaign.ends_on)
  ) THEN
    RAISE EXCEPTION 'The scheduled date is outside the campaign dates.';
  END IF;

  -- Standalone cadence is campaign-wide, not platform-wide. Reusing a date
  -- distributes one occurrence to another platform and does not count twice.
  IF p_mode = 'scheduled' AND v_campaign.event_id IS NULL THEN
    IF EXISTS (
      SELECT 1
        FROM social_campaign_occurrences occurrence
        JOIN social_posts post ON post.campaign_occurrence_id = occurrence.id
        JOIN social_post_variants variant ON variant.post_id = post.id
        JOIN social_deliveries delivery ON delivery.variant_id = variant.id
       WHERE occurrence.campaign_id = p_campaign_id
         AND delivery.scheduled_date IS NOT NULL
         AND delivery.scheduled_date <> p_scheduled_date
         AND delivery.status IN ('proposed', 'scheduled', 'due', 'processing', 'failed')
         AND (delivery.status <> 'failed' OR delivery.retryable = TRUE)
         AND ABS(delivery.scheduled_date - p_scheduled_date) < 3
    ) THEN
      RAISE EXCEPTION 'Standalone campaign posts must be at least three calendar days apart.';
    END IF;

    IF (
      SELECT COUNT(DISTINCT delivery.scheduled_date)
        FROM social_campaign_occurrences occurrence
        JOIN social_posts post ON post.campaign_occurrence_id = occurrence.id
        JOIN social_post_variants variant ON variant.post_id = post.id
        JOIN social_deliveries delivery ON delivery.variant_id = variant.id
       WHERE occurrence.campaign_id = p_campaign_id
         AND delivery.scheduled_date <> p_scheduled_date
         AND date_trunc('week', delivery.scheduled_date::TIMESTAMP) = date_trunc('week', p_scheduled_date::TIMESTAMP)
         AND delivery.status IN ('proposed', 'scheduled', 'due', 'processing', 'failed')
         AND (delivery.status <> 'failed' OR delivery.retryable = TRUE)
    ) >= 2 THEN
      RAISE EXCEPTION 'Standalone campaigns may use at most two posting dates in a Monday-to-Sunday week.';
    END IF;
  END IF;

  INSERT INTO social_campaign_occurrences (
    campaign_id, kind, target_date, generation_key, generated, proposal_status
  ) VALUES (
    p_campaign_id, 'standalone', COALESCE(p_scheduled_date, CURRENT_DATE),
    'manual:' || gen_random_uuid()::TEXT, FALSE,
    CASE WHEN p_mode = 'scheduled' THEN 'confirmed' ELSE 'proposed' END
  ) RETURNING id INTO v_occurrence_id;

  INSERT INTO social_posts (
    title, caption, description, channels, status, scheduled_at, media_url,
    event_id, created_by, post_type, time_slot, hashtags, assigned_to,
    campaign_id, campaign_occurrence_id
  ) VALUES (
    p_title, '', COALESCE(p_description, ''), '{}'::social_channel[],
    CASE WHEN p_mode = 'scheduled' THEN 'scheduled'::social_post_status ELSE 'draft'::social_post_status END,
    v_scheduled_at, NULL, v_campaign.event_id, auth.uid(), 'GENERAL',
    CASE WHEN p_mode = 'scheduled' THEN p_time_slot ELSE NULL END, '{}',
    v_campaign.default_assigned_to, p_campaign_id, v_occurrence_id
  ) RETURNING id INTO v_post_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
    v_channel := (v_item->>'channel')::social_variant_channel;
    v_platform := CASE WHEN v_channel LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform WHEN v_channel = 'whatsapp' THEN 'whatsapp'::social_schedule_platform ELSE 'tiktok'::social_schedule_platform END;
    IF p_mode = 'scheduled' AND EXISTS (
      SELECT 1 FROM social_deliveries
       WHERE schedule_platform = v_platform AND scheduled_date = p_scheduled_date
         AND time_slot = p_time_slot
         AND (status IN ('proposed', 'scheduled', 'due', 'processing')
           OR (status = 'failed' AND retryable = TRUE))
    ) THEN RAISE EXCEPTION 'The % slot is already occupied.', v_platform; END IF;

    INSERT INTO social_post_variants (
      post_id, channel, caption, description, hashtags, media_url, media_items,
      call_to_action_link, call_to_action_caption
    ) VALUES (
      v_post_id, v_channel, COALESCE(v_item->>'caption', ''), COALESCE(p_description, ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'hashtags', '[]'::JSONB))), '{}'),
      NULLIF(v_item->>'media_url', ''),
      COALESCE(v_item->'media_items', '[]'::JSONB),
      NULLIF(v_item->>'call_to_action_link', ''), NULLIF(v_item->>'call_to_action_caption', '')
    ) RETURNING id INTO v_variant_id;

    INSERT INTO social_deliveries (
      variant_id, schedule_platform, scheduled_date, time_slot, scheduled_at,
      status, assigned_to, delivery_method, publication_consented_at, publication_consented_by
    ) VALUES (
      v_variant_id, v_platform,
      CASE WHEN p_mode = 'scheduled' THEN p_scheduled_date ELSE NULL END,
      CASE WHEN p_mode = 'scheduled' THEN p_time_slot ELSE NULL END,
      v_scheduled_at,
      CASE WHEN p_mode = 'scheduled' THEN 'scheduled'::social_delivery_status ELSE 'draft'::social_delivery_status END,
      v_campaign.default_assigned_to, 'automated',
      CASE WHEN p_mode = 'scheduled' THEN NOW() ELSE NULL END,
      CASE WHEN p_mode = 'scheduled' THEN auth.uid() ELSE NULL END
    );
  END LOOP;
  RETURN v_post_id;
END;
$$;

ALTER TABLE social_deliveries
  ALTER COLUMN delivery_method SET DEFAULT 'automated';

UPDATE social_deliveries
   SET delivery_method = 'automated'
 WHERE status NOT IN ('sent', 'skipped');

CREATE OR REPLACE FUNCTION enforce_automated_social_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.delivery_method := 'automated';
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_automated
  BEFORE INSERT ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION enforce_automated_social_delivery();

-- Normalize pending records to the fixed UTC instants. The evening slot is
-- midnight UTC following its posting date. Sent history remains untouched.
UPDATE social_deliveries
   SET scheduled_at = social_slot_scheduled_at(scheduled_date, time_slot)
 WHERE status IN ('scheduled', 'due', 'failed')
   AND scheduled_date IS NOT NULL
   AND time_slot IS NOT NULL;

UPDATE social_posts AS post
   SET scheduled_at = delivery.scheduled_at,
       time_slot = delivery.time_slot
  FROM social_post_variants AS variant
  JOIN social_deliveries AS delivery ON delivery.variant_id = variant.id
 WHERE variant.post_id = post.id
   AND delivery.status IN ('scheduled', 'due', 'failed');

ALTER TABLE social_deliveries
  ADD COLUMN next_attempt_at TIMESTAMPTZ,
  ADD COLUMN retryable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN publication_consented_at TIMESTAMPTZ,
  ADD COLUMN publication_consented_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE social_deliveries
   SET next_attempt_at = scheduled_at
 WHERE status = 'scheduled';

UPDATE social_deliveries
   SET retryable = FALSE,
       next_attempt_at = NULL
 WHERE status = 'failed';

CREATE OR REPLACE FUNCTION sync_social_delivery_next_attempt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'scheduled' AND TG_OP = 'INSERT' THEN
    NEW.next_attempt_at := NEW.scheduled_at;
    NEW.retryable := TRUE;
    NEW.attempt_count := 0;
  ELSIF NEW.status = 'scheduled' AND (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
    OR NEW.next_attempt_at IS NULL
  ) THEN
    NEW.next_attempt_at := NEW.scheduled_at;
    NEW.retryable := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_next_attempt_sync
  BEFORE INSERT OR UPDATE OF status, scheduled_at ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION sync_social_delivery_next_attempt();

CREATE INDEX social_deliveries_claim_idx
  ON social_deliveries(next_attempt_at, attempt_count)
  WHERE status IN ('scheduled', 'failed') AND retryable = TRUE;

-- Earlier proposal generation did not reserve proposed slots. Preserve the
-- strongest existing reservation and send any colliding proposal back for
-- review before expanding the unique index predicate.
WITH ranked AS (
  SELECT delivery.id,
         row_number() OVER (
           PARTITION BY delivery.schedule_platform, delivery.scheduled_date, delivery.time_slot
           ORDER BY CASE delivery.status
             WHEN 'processing' THEN 1 WHEN 'due' THEN 2 WHEN 'scheduled' THEN 3
             WHEN 'failed' THEN 4 ELSE 5 END,
             delivery.created_at,
             delivery.id
         ) AS reservation_rank
    FROM social_deliveries delivery
   WHERE delivery.scheduled_date IS NOT NULL
     AND delivery.time_slot IS NOT NULL
     AND (delivery.status IN ('proposed', 'scheduled', 'due', 'processing')
       OR (delivery.status = 'failed' AND delivery.retryable = TRUE))
), cancelled AS (
  UPDATE social_deliveries delivery
     SET status = 'cancelled',
         provider_error = 'Proposal conflicted with an existing reserved slot during scheduling migration.'
    FROM ranked
   WHERE ranked.id = delivery.id
     AND ranked.reservation_rank > 1
     AND delivery.status = 'proposed'
  RETURNING delivery.variant_id
), affected AS (
  SELECT DISTINCT campaign.id AS campaign_id,
         campaign.schedule_event_snapshot,
         campaign.current_event_snapshot
    FROM social_campaigns campaign
    JOIN social_posts post ON post.campaign_id = campaign.id
    JOIN social_post_variants variant ON variant.post_id = post.id
    JOIN cancelled ON cancelled.variant_id = variant.id
), reviews AS (
  INSERT INTO social_campaign_reviews (
    campaign_id, reason, schedule_snapshot, current_snapshot
  )
  SELECT campaign_id,
         'A proposed post conflicted with an existing reserved slot and needs rescheduling.',
         schedule_event_snapshot,
         current_event_snapshot
    FROM affected
  ON CONFLICT (campaign_id) WHERE status = 'open'
  DO UPDATE SET
    reason = EXCLUDED.reason,
    detected_at = NOW(),
    updated_at = NOW()
  RETURNING campaign_id
)
UPDATE social_campaigns campaign
   SET needs_review = TRUE,
       review_reason = 'A proposed post conflicted with an existing reserved slot and needs rescheduling.'
  FROM affected
 WHERE campaign.id = affected.campaign_id
   AND EXISTS (SELECT 1 FROM reviews WHERE reviews.campaign_id = campaign.id);

DROP INDEX social_deliveries_slot_unique;
CREATE UNIQUE INDEX social_deliveries_slot_unique
  ON social_deliveries (schedule_platform, scheduled_date, time_slot)
  WHERE status IN ('proposed', 'scheduled', 'due', 'processing')
     OR (status = 'failed' AND retryable = TRUE);

-- Direct table writes and future callers receive the same scheduling rules as
-- the manual-post RPC. Proposed records reserve a slot but intentionally keep
-- scheduled_at NULL until confirmed, matching social_delivery_schedule_shape.
CREATE OR REPLACE FUNCTION normalize_social_delivery_schedule()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('proposed', 'scheduled', 'due', 'processing', 'failed') THEN
    IF NEW.scheduled_date IS NULL OR NEW.time_slot IS NULL THEN
      RAISE EXCEPTION 'A date and time slot are required for this delivery status.';
    END IF;
  END IF;

  IF NEW.status IN ('scheduled', 'due', 'processing', 'failed') THEN
    NEW.scheduled_at := social_slot_scheduled_at(NEW.scheduled_date, NEW.time_slot);
  ELSIF NEW.status IN ('draft', 'proposed', 'cancelled') THEN
    NEW.scheduled_at := NULL;
  END IF;

  IF NEW.status = 'scheduled'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'scheduled'
       OR OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
       OR OLD.time_slot IS DISTINCT FROM NEW.time_slot)
     AND NEW.scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Choose a future time slot before scheduling.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_00_schedule_normalization
  BEFORE INSERT OR UPDATE OF status, scheduled_date, time_slot, scheduled_at ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION normalize_social_delivery_schedule();

CREATE OR REPLACE FUNCTION enforce_social_campaign_schedule()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_campaign social_campaigns%ROWTYPE;
BEGIN
  IF NEW.status NOT IN ('proposed', 'scheduled', 'due', 'processing', 'failed')
     OR (NEW.status = 'failed' AND NEW.retryable = FALSE) THEN
    RETURN NEW;
  END IF;

  SELECT campaign.* INTO v_campaign
    FROM social_post_variants variant
    JOIN social_posts post ON post.id = variant.post_id
    JOIN social_campaigns campaign ON campaign.id = post.campaign_id
   WHERE variant.id = NEW.variant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF (v_campaign.starts_on IS NOT NULL AND NEW.scheduled_date < v_campaign.starts_on)
     OR (v_campaign.ends_on IS NOT NULL AND NEW.scheduled_date > v_campaign.ends_on) THEN
    RAISE EXCEPTION 'The scheduled date is outside the campaign dates.';
  END IF;

  IF v_campaign.event_id IS NULL THEN
    IF EXISTS (
      SELECT 1
        FROM social_posts post
        JOIN social_post_variants variant ON variant.post_id = post.id
        JOIN social_deliveries delivery ON delivery.variant_id = variant.id
       WHERE post.campaign_id = v_campaign.id
         AND delivery.id IS DISTINCT FROM NEW.id
         AND delivery.scheduled_date <> NEW.scheduled_date
         AND delivery.status IN ('proposed', 'scheduled', 'due', 'processing', 'failed')
         AND (delivery.status <> 'failed' OR delivery.retryable = TRUE)
         AND ABS(delivery.scheduled_date - NEW.scheduled_date) < 3
    ) THEN
      RAISE EXCEPTION 'Standalone campaign posts must be at least three calendar days apart.';
    END IF;

    IF (
      SELECT COUNT(DISTINCT delivery.scheduled_date)
        FROM social_posts post
        JOIN social_post_variants variant ON variant.post_id = post.id
        JOIN social_deliveries delivery ON delivery.variant_id = variant.id
       WHERE post.campaign_id = v_campaign.id
         AND delivery.id IS DISTINCT FROM NEW.id
         AND delivery.scheduled_date <> NEW.scheduled_date
         AND date_trunc('week', delivery.scheduled_date::TIMESTAMP) = date_trunc('week', NEW.scheduled_date::TIMESTAMP)
         AND delivery.status IN ('proposed', 'scheduled', 'due', 'processing', 'failed')
         AND (delivery.status <> 'failed' OR delivery.retryable = TRUE)
    ) >= 2 THEN
      RAISE EXCEPTION 'Standalone campaigns may use at most two posting dates in a Monday-to-Sunday week.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_campaign_schedule_guard
  BEFORE INSERT OR UPDATE OF status, scheduled_date, time_slot, retryable ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION enforce_social_campaign_schedule();

CREATE OR REPLACE FUNCTION sync_social_post_from_deliveries()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
  v_status social_post_status;
  v_scheduled_at TIMESTAMPTZ;
  v_time_slot time_slot;
BEGIN
  SELECT post_id INTO v_post_id
    FROM social_post_variants
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.variant_id ELSE NEW.variant_id END;
  IF v_post_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT
    CASE
      WHEN bool_and(delivery.status IN ('sent', 'skipped')) THEN 'published'::social_post_status
      WHEN bool_or(delivery.status IN ('scheduled', 'due', 'processing')) THEN 'scheduled'::social_post_status
      WHEN bool_or(delivery.status = 'failed') THEN 'failed'::social_post_status
      ELSE 'draft'::social_post_status
    END,
    MIN(delivery.scheduled_at) FILTER (
      WHERE delivery.status IN ('scheduled', 'due', 'processing', 'failed')
    ),
    (array_agg(delivery.time_slot ORDER BY delivery.scheduled_at)
      FILTER (WHERE delivery.status IN ('scheduled', 'due', 'processing', 'failed')))[1]
    INTO v_status, v_scheduled_at, v_time_slot
    FROM social_post_variants variant
    JOIN social_deliveries delivery ON delivery.variant_id = variant.id
   WHERE variant.post_id = v_post_id;

  IF v_status IS NOT NULL THEN
    UPDATE social_posts
       SET status = v_status,
           scheduled_at = v_scheduled_at,
           time_slot = v_time_slot
     WHERE id = v_post_id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER social_deliveries_post_state_sync
  AFTER INSERT OR UPDATE OF status, scheduled_at, time_slot OR DELETE ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION sync_social_post_from_deliveries();

-- Parent post status is derived by the delivery sync trigger. Permit that
-- nested update while preserving the ordinary permission checks for direct
-- writes to social_posts.
CREATE OR REPLACE FUNCTION guard_social_post_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF auth.role() = 'service_role' OR pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF NEW.status = 'published' AND NOT has_perm('social', 'send') THEN
    RAISE EXCEPTION 'Permission denied: social.send';
  END IF;
  IF (NEW.status = 'scheduled' OR OLD.status = 'scheduled')
     AND NOT has_perm('social', 'schedule') THEN
    RAISE EXCEPTION 'Permission denied: social.schedule';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE social_deliveries DROP CONSTRAINT social_delivery_sent_shape;
ALTER TABLE social_deliveries ADD CONSTRAINT social_delivery_sent_shape CHECK (
  (status IN ('sent', 'skipped') AND sent_at IS NOT NULL
    AND (delivery_method = 'automated' OR sent_by IS NOT NULL))
  OR status NOT IN ('sent', 'skipped')
);

ALTER TABLE notifications
  ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;

CREATE OR REPLACE FUNCTION claim_social_deliveries(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  delivery_id UUID,
  platform social_schedule_platform,
  channel social_variant_channel,
  caption TEXT,
  description TEXT,
  media_items JSONB,
  attempt_number SMALLINT,
  idempotency_key TEXT,
  external_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.';
  END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT delivery.id
      FROM social_deliveries AS delivery
     WHERE delivery.status IN ('scheduled', 'failed')
       AND delivery.retryable = TRUE
       AND delivery.attempt_count < 3
       AND delivery.next_attempt_at <= NOW()
       AND (delivery.schedule_platform <> 'tiktok' OR delivery.publication_consented_at IS NOT NULL)
     ORDER BY delivery.next_attempt_at, delivery.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(p_limit, 100))
  ), updated AS (
    UPDATE social_deliveries AS delivery
       SET status = 'processing',
           attempt_count = delivery.attempt_count + 1,
           last_attempt_at = NOW(),
           next_attempt_at = NULL,
           provider_error = NULL
      FROM claimed
     WHERE delivery.id = claimed.id
     RETURNING delivery.*
  )
  SELECT updated.id, updated.schedule_platform, variant.channel,
         variant.caption, variant.description, variant.media_items,
         updated.attempt_count, updated.idempotency_key, updated.external_id
    FROM updated
    JOIN social_post_variants AS variant ON variant.id = updated.variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION complete_social_delivery_attempt(
  p_delivery_id UUID,
  p_success BOOLEAN,
  p_provider_post_id TEXT DEFAULT NULL,
  p_external_url TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_retryable BOOLEAN DEFAULT TRUE
)
RETURNS social_delivery_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_delivery social_deliveries%ROWTYPE; v_status social_delivery_status;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
  SELECT * INTO v_delivery FROM social_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND OR v_delivery.status <> 'processing' THEN RAISE EXCEPTION 'Delivery is not processing.'; END IF;
  IF p_success THEN
    v_status := 'sent';
    UPDATE social_deliveries SET status = v_status, sent_at = NOW(), sent_by = NULL,
      external_id = p_provider_post_id, external_url = p_external_url,
      provider_error = NULL, retryable = FALSE, next_attempt_at = NULL
    WHERE id = p_delivery_id;
  ELSE
    v_status := 'failed';
    UPDATE social_deliveries SET status = v_status,
      external_id = COALESCE(p_provider_post_id, external_id),
      provider_error = LEFT(COALESCE(p_error, 'Unknown provider failure.'), 2000),
      retryable = p_retryable AND attempt_count < 3,
      next_attempt_at = CASE WHEN p_retryable AND attempt_count < 3 THEN NOW() ELSE NULL END
    WHERE id = p_delivery_id;
  END IF;
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION claim_social_deliveries(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_social_delivery_attempt(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_social_deliveries(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_social_delivery_attempt(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

CREATE UNIQUE INDEX social_post_review_items_post_unique
  ON social_post_review_items(review_id, post_id)
  WHERE post_id IS NOT NULL;

-- Ensure each event change presents the current set of mutable generated posts.
CREATE OR REPLACE FUNCTION refresh_social_review_items(p_review_id UUID, p_campaign_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM social_post_review_items WHERE review_id = p_review_id;
  INSERT INTO social_post_review_items (
    review_id, post_id, occurrence_id, item_type, previous_state, detail
  )
  SELECT DISTINCT ON (post.id)
    p_review_id, post.id, post.campaign_occurrence_id, 'affected_post',
    jsonb_build_object('title', post.title, 'status', post.status),
    'This future post may be affected by the latest event schedule.'
  FROM social_posts AS post
  JOIN social_post_variants AS variant ON variant.post_id = post.id
  JOIN social_deliveries AS delivery ON delivery.variant_id = variant.id
  WHERE post.campaign_id = p_campaign_id
    AND delivery.status NOT IN ('sent', 'skipped', 'cancelled')
  ORDER BY post.id;
END;
$$;

REVOKE ALL ON FUNCTION refresh_social_review_items(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION refresh_social_review_items_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'open' THEN PERFORM refresh_social_review_items(NEW.id, NEW.campaign_id); END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION refresh_social_review_items_trigger() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER social_campaign_review_items_refresh
  AFTER INSERT OR UPDATE OF current_snapshot, detected_at ON social_campaign_reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_social_review_items_trigger();

CREATE OR REPLACE FUNCTION open_current_social_campaign_review(
  p_event_id BIGINT,
  p_reason TEXT,
  p_current_snapshot JSONB DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_campaign social_campaigns%ROWTYPE;
  v_snapshot JSONB;
  v_review_id UUID;
BEGIN
  SELECT * INTO v_campaign FROM social_campaigns
   WHERE event_id = p_event_id AND status NOT IN ('completed', 'archived') FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_snapshot := COALESCE(p_current_snapshot, social_event_snapshot(p_event_id), '{}'::JSONB);
  UPDATE social_campaigns SET needs_review = TRUE, review_reason = p_reason,
    current_event_snapshot = v_snapshot, updated_at = NOW() WHERE id = v_campaign.id;
  SELECT id INTO v_review_id FROM social_campaign_reviews
   WHERE campaign_id = v_campaign.id AND status = 'open' FOR UPDATE;
  IF v_review_id IS NULL THEN
    INSERT INTO social_campaign_reviews (campaign_id, reason, schedule_snapshot, current_snapshot)
    VALUES (v_campaign.id, p_reason, v_campaign.schedule_event_snapshot, v_snapshot)
    RETURNING id INTO v_review_id;
  ELSE
    UPDATE social_campaign_reviews SET reason = p_reason,
      schedule_snapshot = v_campaign.schedule_event_snapshot,
      current_snapshot = v_snapshot, detected_at = NOW(), updated_at = NOW()
    WHERE id = v_review_id;
    UPDATE social_campaign_occurrences SET proposal_status = 'superseded'
    WHERE review_id = v_review_id AND proposal_status = 'proposed';
  END IF;
  PERFORM refresh_social_review_items(v_review_id, v_campaign.id);
END;
$$;

CREATE OR REPLACE FUNCTION resolve_social_campaign_review(
  p_review_id UUID,
  p_decision TEXT,
  p_post_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_review social_campaign_reviews%ROWTYPE; v_item social_post_review_items%ROWTYPE;
BEGIN
  IF NOT has_perm('social', 'review') THEN RAISE EXCEPTION 'Permission denied: social.review'; END IF;
  IF p_decision NOT IN ('keep_post', 'regenerate_post', 'keep_all', 'regenerate_all') THEN RAISE EXCEPTION 'Invalid review decision.'; END IF;
  SELECT * INTO v_review FROM social_campaign_reviews WHERE id = p_review_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open review not found.'; END IF;

  IF p_decision IN ('keep_post', 'regenerate_post') THEN
    SELECT * INTO v_item FROM social_post_review_items
     WHERE review_id = p_review_id AND post_id = p_post_id AND decision = 'unresolved' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unresolved review item not found.'; END IF;
    IF p_decision = 'regenerate_post' THEN
      DELETE FROM social_posts WHERE id = v_item.post_id;
      DELETE FROM social_campaign_occurrences WHERE id = v_item.occurrence_id;
    END IF;
    UPDATE social_post_review_items SET
      decision = CASE WHEN p_decision = 'keep_post' THEN 'kept' ELSE 'regenerated' END,
      decided_at = NOW(), decided_by = auth.uid()
    WHERE id = v_item.id;
  ELSE
    IF p_decision = 'regenerate_all' THEN
      DELETE FROM social_posts AS post
       USING social_post_review_items AS item
       WHERE item.review_id = p_review_id AND item.post_id = post.id
         AND item.decision = 'unresolved'
         AND NOT EXISTS (
           SELECT 1 FROM social_post_variants variant
           JOIN social_deliveries delivery ON delivery.variant_id = variant.id
           WHERE variant.post_id = post.id AND delivery.status IN ('sent', 'skipped')
         );
      DELETE FROM social_campaign_occurrences AS occurrence
       USING social_post_review_items AS item
       WHERE item.review_id = p_review_id AND item.occurrence_id = occurrence.id
         AND item.decision = 'unresolved';
    END IF;
    UPDATE social_post_review_items SET
      decision = CASE WHEN p_decision = 'keep_all' THEN 'kept' ELSE 'regenerated' END,
      decided_at = NOW(), decided_by = auth.uid()
    WHERE review_id = p_review_id AND decision = 'unresolved';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM social_post_review_items WHERE review_id = p_review_id AND decision = 'unresolved') THEN
    UPDATE social_campaign_reviews SET status = 'resolved', resolved_at = NOW(), resolved_by = auth.uid()
    WHERE id = p_review_id;
    UPDATE social_campaigns SET needs_review = FALSE, review_reason = NULL,
      schedule_event_snapshot = current_event_snapshot,
      generated_through = CASE WHEN p_decision IN ('regenerate_post', 'regenerate_all') THEN NULL ELSE generated_through END,
      next_generation_at = CASE WHEN p_decision IN ('regenerate_post', 'regenerate_all') THEN NOW() ELSE next_generation_at END
    WHERE id = v_review.campaign_id;
  ELSIF p_decision IN ('regenerate_post', 'regenerate_all') THEN
    UPDATE social_campaigns SET generated_through = NULL, next_generation_at = NOW()
    WHERE id = v_review.campaign_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION resolve_social_campaign_review(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resolve_social_campaign_review(UUID, TEXT, UUID) TO authenticated;
