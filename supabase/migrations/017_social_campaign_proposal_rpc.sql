-- 017: Transactional, idempotent persistence for generated campaign proposals.

ALTER TABLE social_campaigns
  ADD COLUMN launch_decision_made BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION persist_social_campaign_proposals(
  p_campaign_id UUID,
  p_proposals JSONB,
  p_suppressed JSONB,
  p_generated_through DATE,
  p_launch_occurrence_at TIMESTAMPTZ,
  p_launch_decision_made BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign social_campaigns%ROWTYPE;
  v_proposal JSONB;
  v_channel TEXT;
  v_occurrence_id UUID;
  v_post_id UUID;
  v_variant_id UUID;
  v_review_id UUID;
  v_inserted INTEGER := 0;
  v_kind social_occurrence_kind;
  v_post_type TEXT;
  v_schedule_platform social_schedule_platform;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT has_perm('social', 'schedule') THEN
    RAISE EXCEPTION 'Permission denied: social.schedule';
  END IF;

  SELECT * INTO v_campaign
    FROM social_campaigns
   WHERE id = p_campaign_id
     AND status <> 'archived'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;
  IF NOT v_campaign.generation_enabled OR v_campaign.event_id IS NULL THEN
    RAISE EXCEPTION 'This campaign does not use event generation.';
  END IF;

  FOR v_proposal IN SELECT value FROM jsonb_array_elements(COALESCE(p_proposals, '[]'::JSONB)) LOOP
    v_kind := (v_proposal->>'kind')::social_occurrence_kind;
    v_post_type := CASE WHEN v_kind = 'initial' THEN 'ANNOUNCEMENT' ELSE 'REMINDER' END;

    INSERT INTO social_campaign_occurrences (
      campaign_id, kind, milestone_days, event_occurrence_at, target_date,
      sequence, generation_key, generated, proposal_status
    ) VALUES (
      p_campaign_id,
      v_kind,
      NULLIF(v_proposal->>'milestoneDays', '')::SMALLINT,
      (v_proposal->>'eventOccurrenceAt')::TIMESTAMPTZ,
      (v_proposal->>'targetDate')::DATE,
      COALESCE((v_proposal->>'sequence')::INTEGER, 0),
      v_proposal->>'generationKey',
      TRUE,
      'proposed'
    )
    ON CONFLICT (campaign_id, generation_key) DO NOTHING
    RETURNING id INTO v_occurrence_id;

    IF v_occurrence_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO social_posts (
      title, caption, description, channels, status, scheduled_at, media_url,
      event_id, created_by, post_type, time_slot, hashtags, assigned_to,
      campaign_id, campaign_occurrence_id
    ) VALUES (
      v_proposal->>'title',
      COALESCE(v_proposal->>'caption', ''),
      COALESCE(v_proposal->>'description', ''),
      '{}'::social_channel[],
      'draft',
      NULL,
      NULLIF(v_proposal->>'mediaUrl', ''),
      v_campaign.event_id,
      v_campaign.created_by,
      v_post_type,
      NULL,
      '{}',
      v_campaign.default_assigned_to,
      p_campaign_id,
      v_occurrence_id
    ) RETURNING id INTO v_post_id;

    FOR v_channel IN SELECT jsonb_array_elements_text(v_proposal->'channels') LOOP
      INSERT INTO social_post_variants (
        post_id, channel, caption, description, hashtags, media_url,
        call_to_action_link, call_to_action_caption
      ) VALUES (
        v_post_id,
        v_channel::social_variant_channel,
        COALESCE(v_proposal->>'caption', ''),
        COALESCE(v_proposal->>'description', ''),
        '{}',
        NULLIF(v_proposal->>'mediaUrl', ''),
        NULLIF(v_proposal->>'callToActionLink', ''),
        NULLIF(v_proposal->>'callToActionCaption', '')
      ) RETURNING id INTO v_variant_id;

      v_schedule_platform := CASE
        WHEN v_channel LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform
        WHEN v_channel = 'whatsapp' THEN 'whatsapp'::social_schedule_platform
        ELSE 'tiktok'::social_schedule_platform
      END;

      INSERT INTO social_deliveries (
        variant_id, schedule_platform, scheduled_date, time_slot, scheduled_at,
        status, assigned_to, delivery_method
      ) VALUES (
        v_variant_id,
        v_schedule_platform,
        NULLIF(v_proposal->'suggestions'->v_channel->>'date', '')::DATE,
        NULLIF(v_proposal->'suggestions'->v_channel->>'slot', '')::time_slot,
        NULL,
        'proposed',
        v_campaign.default_assigned_to,
        'manual'
      );
    END LOOP;

    v_inserted := v_inserted + 1;
    v_occurrence_id := NULL;
  END LOOP;

  IF jsonb_array_length(COALESCE(p_suppressed, '[]'::JSONB)) > 0 THEN
    SELECT id INTO v_review_id FROM social_campaign_reviews
     WHERE campaign_id = p_campaign_id AND status = 'open' FOR UPDATE;
    IF v_review_id IS NULL THEN
      INSERT INTO social_campaign_reviews (
        campaign_id, reason, schedule_snapshot, current_snapshot
      ) VALUES (
        p_campaign_id,
        'Overlapping recurring reminders need review.',
        v_campaign.schedule_event_snapshot,
        v_campaign.current_event_snapshot
      ) RETURNING id INTO v_review_id;
    END IF;

    INSERT INTO social_post_review_items (review_id, item_type, previous_state, proposed_state, detail)
    SELECT
      v_review_id,
      'suppressed_reminder',
      '{}'::JSONB,
      value,
      'A reminder overlapped another reminder for this campaign and platform.'
    FROM jsonb_array_elements(p_suppressed);

    UPDATE social_campaigns SET
      needs_review = TRUE,
      review_reason = 'Overlapping recurring reminders need review.'
    WHERE id = p_campaign_id;
  END IF;

  UPDATE social_campaigns SET
    launch_occurrence_at = p_launch_occurrence_at,
    launch_decision_made = p_launch_decision_made,
    generated_through = GREATEST(COALESCE(generated_through, p_generated_through), p_generated_through),
    last_generated_at = NOW(),
    next_generation_at = (
      p_generated_through::TIMESTAMP AT TIME ZONE 'America/Toronto'
    ) - make_interval(days => generation_lead_days),
    updated_at = NOW()
  WHERE id = p_campaign_id;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION persist_social_campaign_proposals(UUID, JSONB, JSONB, DATE, TIMESTAMPTZ, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION persist_social_campaign_proposals(UUID, JSONB, JSONB, DATE, TIMESTAMPTZ, BOOLEAN)
  TO authenticated, service_role;
