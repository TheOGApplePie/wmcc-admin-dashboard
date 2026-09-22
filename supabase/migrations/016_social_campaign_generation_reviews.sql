-- 016: Simplify campaigns and add rolling generation/review state.
-- A campaign is only a container. Its optional event relationship determines
-- whether event-based generation applies and whether recurrence comes from RRULE.

ALTER TABLE social_campaigns
  DROP CONSTRAINT IF EXISTS social_campaign_event_shape;

ALTER TABLE social_campaigns
  DROP COLUMN IF EXISTS campaign_type;

DROP TYPE IF EXISTS social_campaign_type;

ALTER TABLE social_campaigns
  RENAME COLUMN event_snapshot TO schedule_event_snapshot;

ALTER TABLE social_campaigns
  ADD COLUMN launch_occurrence_at TIMESTAMPTZ,
  ADD COLUMN generation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN generation_horizon_days SMALLINT NOT NULL DEFAULT 28
    CHECK (generation_horizon_days BETWEEN 7 AND 90),
  ADD COLUMN generation_lead_days SMALLINT NOT NULL DEFAULT 7
    CHECK (generation_lead_days BETWEEN 1 AND 30),
  ADD COLUMN generated_through DATE,
  ADD COLUMN last_generated_at TIMESTAMPTZ,
  ADD COLUMN next_generation_at TIMESTAMPTZ,
  ADD COLUMN current_event_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD CONSTRAINT social_campaign_generation_window_check
    CHECK (generation_lead_days < generation_horizon_days),
  ADD CONSTRAINT social_campaign_event_generation_check
    CHECK (event_id IS NOT NULL OR generation_enabled = FALSE);

CREATE UNIQUE INDEX social_campaigns_one_per_event
  ON social_campaigns(event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX social_campaigns_generation_due_idx
  ON social_campaigns(next_generation_at)
  WHERE generation_enabled = TRUE AND status = 'active';

CREATE TABLE social_campaign_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES social_campaigns(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL,
  schedule_snapshot JSONB NOT NULL DEFAULT '{}',
  current_snapshot  JSONB NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'superseded')),
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_campaign_review_resolution_check CHECK (
    (status = 'open' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (status <> 'open' AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX social_campaign_reviews_one_open
  ON social_campaign_reviews(campaign_id)
  WHERE status = 'open';

CREATE TABLE social_post_review_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id           UUID NOT NULL REFERENCES social_campaign_reviews(id) ON DELETE CASCADE,
  post_id             UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  occurrence_id       UUID REFERENCES social_campaign_occurrences(id) ON DELETE SET NULL,
  item_type           TEXT NOT NULL
    CHECK (item_type IN ('affected_post', 'suppressed_reminder', 'deleted_event')),
  decision            TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (decision IN ('unresolved', 'kept', 'regenerated', 'suppression_accepted', 'cancelled')),
  previous_state      JSONB NOT NULL DEFAULT '{}',
  proposed_state      JSONB NOT NULL DEFAULT '{}',
  detail              TEXT,
  decided_at          TIMESTAMPTZ,
  decided_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_post_review_decision_check CHECK (
    (decision = 'unresolved' AND decided_at IS NULL AND decided_by IS NULL)
    OR (decision <> 'unresolved' AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
);

ALTER TABLE social_campaign_occurrences
  ADD COLUMN proposal_status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (proposal_status IN ('proposed', 'confirmed', 'superseded', 'cancelled')),
  ADD COLUMN superseded_by UUID REFERENCES social_campaign_occurrences(id) ON DELETE SET NULL,
  ADD COLUMN review_id UUID REFERENCES social_campaign_reviews(id) ON DELETE SET NULL;

CREATE INDEX social_post_review_items_unresolved_idx
  ON social_post_review_items(review_id)
  WHERE decision = 'unresolved';

CREATE INDEX social_occurrences_proposal_status_idx
  ON social_campaign_occurrences(campaign_id, proposal_status, target_date);

CREATE TRIGGER social_campaign_reviews_updated_at
  BEFORE UPDATE ON social_campaign_reviews
  FOR EACH ROW EXECUTE FUNCTION set_social_updated_at();

CREATE TRIGGER social_post_review_items_updated_at
  BEFORE UPDATE ON social_post_review_items
  FOR EACH ROW EXECUTE FUNCTION set_social_updated_at();

ALTER TABLE social_campaign_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_campaign_reviews_select ON social_campaign_reviews
  FOR SELECT USING (has_perm('social', 'view'));
CREATE POLICY social_campaign_reviews_insert ON social_campaign_reviews
  FOR INSERT WITH CHECK (has_perm('social', 'schedule'));
CREATE POLICY social_campaign_reviews_update ON social_campaign_reviews
  FOR UPDATE USING (has_perm('social', 'schedule') OR has_perm('social', 'override'))
  WITH CHECK (has_perm('social', 'schedule') OR has_perm('social', 'override'));

CREATE POLICY social_post_review_items_select ON social_post_review_items
  FOR SELECT USING (has_perm('social', 'view'));
CREATE POLICY social_post_review_items_insert ON social_post_review_items
  FOR INSERT WITH CHECK (has_perm('social', 'schedule'));
CREATE POLICY social_post_review_items_update ON social_post_review_items
  FOR UPDATE USING (has_perm('social', 'schedule') OR has_perm('social', 'override'))
  WITH CHECK (has_perm('social', 'schedule') OR has_perm('social', 'override'));

-- Snapshot the current event and recurrence configuration. This is intentionally
-- one current snapshot, not a version history.
CREATE OR REPLACE FUNCTION social_event_snapshot(p_event_id BIGINT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'event_id', event.id,
    'title', event.title,
    'start_date', event.start_date,
    'end_date', event.end_date,
    'is_recurring', event.is_recurring,
    'recurrence_rule_id', event.recurrence_rule_id,
    'recurrence_rule', CASE WHEN rule.id IS NULL THEN NULL ELSE jsonb_build_object(
      'frequency', rule.frequency,
      'interval', rule.interval,
      'by_weekdays', rule.by_weekdays,
      'by_month_day', rule.by_month_day,
      'by_set_position', rule.by_set_position,
      'until', rule.until,
      'count', rule.count,
      'exdates', rule.exdates
    ) END
  )
  FROM events AS event
  LEFT JOIN recurrence_rule AS rule ON rule.id = event.recurrence_rule_id
  WHERE event.id = p_event_id;
$$;

-- Maintain exactly one open review. A later event change overwrites the current
-- snapshot and proposals so review always reflects latest event state.
CREATE OR REPLACE FUNCTION open_current_social_campaign_review(
  p_event_id BIGINT,
  p_reason TEXT,
  p_current_snapshot JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign social_campaigns%ROWTYPE;
  v_snapshot JSONB;
  v_review_id UUID;
BEGIN
  SELECT * INTO v_campaign
    FROM social_campaigns
   WHERE event_id = p_event_id
     AND status NOT IN ('completed', 'archived')
   FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  v_snapshot := COALESCE(p_current_snapshot, social_event_snapshot(p_event_id), '{}'::JSONB);

  UPDATE social_campaigns
     SET needs_review = TRUE,
         review_reason = p_reason,
         current_event_snapshot = v_snapshot,
         updated_at = NOW()
   WHERE id = v_campaign.id;

  SELECT id INTO v_review_id
    FROM social_campaign_reviews
   WHERE campaign_id = v_campaign.id AND status = 'open'
   FOR UPDATE;

  IF v_review_id IS NULL THEN
    INSERT INTO social_campaign_reviews (
      campaign_id, reason, schedule_snapshot, current_snapshot
    ) VALUES (
      v_campaign.id, p_reason, v_campaign.schedule_event_snapshot, v_snapshot
    );
  ELSE
    UPDATE social_campaign_reviews
       SET reason = p_reason,
           schedule_snapshot = v_campaign.schedule_event_snapshot,
           current_snapshot = v_snapshot,
           detected_at = NOW(),
           updated_at = NOW()
     WHERE id = v_review_id;

    -- Previous unconfirmed proposals no longer describe the latest event state.
    UPDATE social_campaign_occurrences
       SET proposal_status = 'superseded'
     WHERE review_id = v_review_id
       AND proposal_status = 'proposed';

    -- Only the latest event state matters; discard decisions from the stale review.
    DELETE FROM social_post_review_items
     WHERE review_id = v_review_id;
  END IF;
END;
$$;

-- Replace the simple 015 trigger functions with current-snapshot review handling.
CREATE OR REPLACE FUNCTION flag_social_campaigns_for_event_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.is_recurring IS DISTINCT FROM OLD.is_recurring
     OR NEW.recurrence_rule_id IS DISTINCT FROM OLD.recurrence_rule_id THEN
    PERFORM open_current_social_campaign_review(
      NEW.id,
      'The linked event schedule changed.'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION flag_social_campaigns_for_rrule_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  IF ROW(NEW.frequency, NEW.interval, NEW.by_weekdays, NEW.by_month_day,
         NEW.by_set_position, NEW.until, NEW.count, NEW.exdates)
     IS DISTINCT FROM
     ROW(OLD.frequency, OLD.interval, OLD.by_weekdays, OLD.by_month_day,
         OLD.by_set_position, OLD.until, OLD.count, OLD.exdates) THEN
    FOR v_event_id IN SELECT id FROM events WHERE recurrence_rule_id = NEW.id LOOP
      PERFORM open_current_social_campaign_review(
        v_event_id,
        'The linked recurring-event schedule changed.'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION preserve_social_campaigns_before_event_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  v_snapshot := social_event_snapshot(OLD.id) || jsonb_build_object('deleted', TRUE);
  PERFORM open_current_social_campaign_review(
    OLD.id,
    'The linked event was deleted.',
    v_snapshot
  );
  UPDATE social_campaigns
     SET status = CASE WHEN status = 'active' THEN 'paused' ELSE status END
   WHERE event_id = OLD.id
     AND status NOT IN ('completed', 'archived');
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION open_current_social_campaign_review(BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
