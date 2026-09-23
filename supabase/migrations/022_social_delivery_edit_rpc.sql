-- 022: Update post content and delivery scheduling atomically.

CREATE OR REPLACE FUNCTION update_social_delivery_post(
  p_delivery_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_caption TEXT,
  p_media_url TEXT,
  p_media_items JSONB,
  p_hashtags TEXT[],
  p_call_to_action_link TEXT,
  p_call_to_action_caption TEXT,
  p_channel social_variant_channel,
  p_mode TEXT,
  p_scheduled_date DATE,
  p_time_slot time_slot
)
RETURNS TABLE (
  post_id UUID,
  variant_id UUID,
  schedule_platform social_schedule_platform,
  scheduled_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_status social_delivery_status;
  v_post_id UUID;
  v_variant_id UUID;
  v_occurrence_id UUID;
  v_platform social_schedule_platform;
  v_scheduled_at TIMESTAMPTZ;
  v_media_count INTEGER;
BEGIN
  IF NOT has_perm('social', 'edit') THEN
    RAISE EXCEPTION 'Permission denied: social.edit';
  END IF;
  IF p_mode NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Invalid post mode.';
  END IF;
  IF jsonb_typeof(COALESCE(p_media_items, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Media items must be an array.';
  END IF;
  v_media_count := jsonb_array_length(COALESCE(p_media_items, '[]'::JSONB));
  IF p_channel <> 'instagram_feed' AND v_media_count > 1 THEN
    RAISE EXCEPTION 'Only Instagram Feed supports multiple media items.';
  END IF;
  IF p_mode = 'scheduled' THEN
    IF length(btrim(COALESCE(p_caption, ''))) = 0 THEN
      RAISE EXCEPTION 'A caption is required to schedule a post.';
    END IF;
    IF p_channel <> 'whatsapp' AND v_media_count = 0 THEN
      RAISE EXCEPTION 'Media is required for this platform.';
    END IF;
    IF p_channel IN ('instagram_feed', 'instagram_story') AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_media_items, '[]'::JSONB)) item
       WHERE length(btrim(COALESCE(item->>'alt_text', ''))) = 0
    ) THEN
      RAISE EXCEPTION 'Alt text is required for every Instagram image.';
    END IF;
  END IF;

  SELECT delivery.status, variant.id, post.id, post.campaign_occurrence_id
    INTO v_delivery_status, v_variant_id, v_post_id, v_occurrence_id
    FROM social_deliveries delivery
    JOIN social_post_variants variant ON variant.id = delivery.variant_id
    JOIN social_posts post ON post.id = variant.post_id
   WHERE delivery.id = p_delivery_id
   FOR UPDATE OF delivery, variant, post;
  IF NOT FOUND THEN RAISE EXCEPTION 'Social delivery not found.'; END IF;
  IF v_delivery_status IN ('due', 'processing', 'sent', 'skipped') THEN
    RAISE EXCEPTION 'This delivery can no longer be edited.';
  END IF;

  IF p_mode = 'scheduled' THEN
    IF NOT has_perm('social', 'schedule') THEN
      RAISE EXCEPTION 'Permission denied: social.schedule';
    END IF;
    IF p_scheduled_date IS NULL OR p_time_slot IS NULL THEN
      RAISE EXCEPTION 'A date and time slot are required to schedule a post.';
    END IF;
    v_scheduled_at := social_slot_scheduled_at(p_scheduled_date, p_time_slot);
    IF v_scheduled_at <= NOW() THEN
      RAISE EXCEPTION 'Choose a future time slot before scheduling.';
    END IF;
  ELSIF v_delivery_status IS DISTINCT FROM 'draft'
        AND NOT has_perm('social', 'schedule') THEN
    RAISE EXCEPTION 'Permission denied: social.schedule';
  END IF;

  v_platform := CASE
    WHEN p_channel LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform
    WHEN p_channel = 'whatsapp' THEN 'whatsapp'::social_schedule_platform
    ELSE 'tiktok'::social_schedule_platform
  END;

  UPDATE social_posts
     SET title = p_title,
         description = COALESCE(p_description, ''),
         media_url = NULLIF(p_media_url, ''),
         hashtags = COALESCE(p_hashtags, '{}'),
         call_to_action_link = NULLIF(p_call_to_action_link, ''),
         call_to_action_caption = NULLIF(p_call_to_action_caption, '')
   WHERE id = v_post_id;

  UPDATE social_post_variants
     SET channel = p_channel,
         caption = COALESCE(p_caption, ''),
         description = COALESCE(p_description, ''),
         media_url = NULLIF(p_media_url, ''),
         media_items = COALESCE(p_media_items, '[]'::JSONB),
         hashtags = COALESCE(p_hashtags, '{}'),
         call_to_action_link = NULLIF(p_call_to_action_link, ''),
         call_to_action_caption = NULLIF(p_call_to_action_caption, '')
   WHERE id = v_variant_id;

  UPDATE social_deliveries
     SET schedule_platform = v_platform,
         scheduled_date = CASE WHEN p_mode = 'scheduled' THEN p_scheduled_date ELSE NULL END,
         time_slot = CASE WHEN p_mode = 'scheduled' THEN p_time_slot ELSE NULL END,
         scheduled_at = CASE WHEN p_mode = 'scheduled' THEN v_scheduled_at ELSE NULL END,
         status = p_mode::social_delivery_status,
         publication_consented_at = CASE WHEN p_mode = 'scheduled' THEN NOW() ELSE NULL END,
         publication_consented_by = CASE WHEN p_mode = 'scheduled' THEN auth.uid() ELSE NULL END,
         attempt_count = CASE WHEN p_mode = 'scheduled' THEN 0 ELSE attempt_count END,
         retryable = CASE WHEN p_mode = 'scheduled' THEN TRUE ELSE retryable END,
         next_attempt_at = CASE WHEN p_mode = 'scheduled' THEN v_scheduled_at ELSE NULL END,
         provider_error = CASE WHEN p_mode = 'scheduled' THEN NULL ELSE provider_error END,
         external_id = CASE WHEN p_mode = 'scheduled' THEN NULL ELSE external_id END
   WHERE id = p_delivery_id;

  IF v_occurrence_id IS NOT NULL AND p_mode = 'scheduled' THEN
    UPDATE social_campaign_occurrences
       SET proposal_status = 'confirmed'
     WHERE id = v_occurrence_id
       AND proposal_status = 'proposed'
       AND NOT EXISTS (
         SELECT 1
           FROM social_posts occurrence_post
           JOIN social_post_variants occurrence_variant ON occurrence_variant.post_id = occurrence_post.id
           JOIN social_deliveries occurrence_delivery ON occurrence_delivery.variant_id = occurrence_variant.id
          WHERE occurrence_post.campaign_occurrence_id = v_occurrence_id
            AND occurrence_delivery.status IN ('draft', 'proposed')
       );
  ELSIF v_occurrence_id IS NOT NULL AND p_mode = 'draft' THEN
    UPDATE social_campaign_occurrences
       SET proposal_status = 'proposed'
     WHERE id = v_occurrence_id
       AND generated = TRUE
       AND proposal_status = 'confirmed';
  END IF;

  RETURN QUERY SELECT v_post_id, v_variant_id, v_platform, v_scheduled_at;
END;
$$;

REVOKE ALL ON FUNCTION update_social_delivery_post(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT,
  social_variant_channel, TEXT, DATE, time_slot
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_social_delivery_post(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT,
  social_variant_channel, TEXT, DATE, time_slot
) TO authenticated;

-- A crashed worker must not leave a delivery in processing forever. The next
-- cron run releases claims older than the lease and either retries them or
-- marks them terminal after the third attempt.
CREATE OR REPLACE FUNCTION recover_stuck_social_deliveries(
  p_stale_before TIMESTAMPTZ
)
RETURNS TABLE (
  delivery_id UUID,
  platform social_schedule_platform,
  attempt_number SMALLINT,
  terminal BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.';
  END IF;
  RETURN QUERY
  UPDATE social_deliveries delivery
     SET status = 'failed',
         retryable = delivery.attempt_count < 3,
         next_attempt_at = CASE WHEN delivery.attempt_count < 3 THEN NOW() ELSE NULL END,
         provider_error = 'The publishing worker stopped before completing this attempt.'
   WHERE delivery.status = 'processing'
     AND delivery.last_attempt_at < p_stale_before
  RETURNING delivery.id, delivery.schedule_platform, delivery.attempt_count,
            delivery.attempt_count >= 3;
END;
$$;

REVOKE ALL ON FUNCTION recover_stuck_social_deliveries(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recover_stuck_social_deliveries(TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION require_active_campaign_for_scheduling()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_campaign_status social_campaign_status;
BEGIN
  IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;
  SELECT campaign.status INTO v_campaign_status
    FROM social_post_variants variant
    JOIN social_posts post ON post.id = variant.post_id
    JOIN social_campaigns campaign ON campaign.id = post.campaign_id
   WHERE variant.id = NEW.variant_id;
  IF v_campaign_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Only active campaigns can schedule posts.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_active_campaign_schedule
  BEFORE INSERT OR UPDATE OF status ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION require_active_campaign_for_scheduling();
