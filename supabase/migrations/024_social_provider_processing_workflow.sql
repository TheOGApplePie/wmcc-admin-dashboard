-- 024: Claim and poll asynchronous provider publications without consuming retries.

ALTER TABLE social_deliveries
  ADD COLUMN provider_processing_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION reset_social_provider_processing_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'scheduled' AND OLD.status IS DISTINCT FROM 'scheduled' THEN
    NEW.provider_processing_started_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_deliveries_provider_processing_reset
  BEFORE UPDATE OF status ON social_deliveries
  FOR EACH ROW EXECUTE FUNCTION reset_social_provider_processing_state();

DROP INDEX IF EXISTS social_deliveries_claim_idx;
CREATE INDEX social_deliveries_claim_idx
  ON social_deliveries(next_attempt_at, attempt_count)
  WHERE status IN ('scheduled', 'failed', 'provider_processing') AND retryable = TRUE;

CREATE OR REPLACE FUNCTION claim_social_deliveries(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  delivery_id UUID, platform social_schedule_platform, channel social_variant_channel,
  caption TEXT, description TEXT, media_items JSONB, attempt_number SMALLINT,
  idempotency_key TEXT, external_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT delivery.id, delivery.status = 'provider_processing' AS is_status_poll
      FROM social_deliveries AS delivery
      JOIN social_post_variants variant ON variant.id = delivery.variant_id
      JOIN social_posts post ON post.id = variant.post_id
      JOIN social_campaigns campaign ON campaign.id = post.campaign_id
     WHERE delivery.status IN ('scheduled', 'failed', 'provider_processing')
       AND campaign.status = 'active'
       AND delivery.retryable = TRUE
       AND (delivery.status = 'provider_processing' OR delivery.attempt_count < 3)
       AND delivery.next_attempt_at <= NOW()
       AND (delivery.schedule_platform <> 'tiktok' OR delivery.publication_consented_at IS NOT NULL)
     ORDER BY delivery.next_attempt_at, delivery.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(p_limit, 100))
  ), updated AS (
    UPDATE social_deliveries AS delivery
       SET status = 'processing',
           attempt_count = delivery.attempt_count + CASE WHEN claimed.is_status_poll THEN 0 ELSE 1 END,
           last_attempt_at = NOW(), next_attempt_at = NULL, provider_error = NULL
      FROM claimed WHERE delivery.id = claimed.id
     RETURNING delivery.*
  )
  SELECT updated.id, updated.schedule_platform, variant.channel,
         variant.caption, variant.description, variant.media_items,
         updated.attempt_count, updated.idempotency_key, updated.external_id
    FROM updated JOIN social_post_variants AS variant ON variant.id = updated.variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_social_delivery_provider_processing(
  p_delivery_id UUID, p_provider_post_id TEXT, p_message TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
  UPDATE social_deliveries
     SET status = 'provider_processing', external_id = COALESCE(p_provider_post_id, external_id),
         provider_error = LEFT(COALESCE(p_message, 'Provider is processing the publication.'), 2000),
         retryable = TRUE, next_attempt_at = NOW(),
         provider_processing_started_at = COALESCE(provider_processing_started_at, NOW())
   WHERE id = p_delivery_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery is not processing.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sync_social_post_from_deliveries()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_post_id UUID; v_status social_post_status; v_scheduled_at TIMESTAMPTZ; v_time_slot time_slot;
BEGIN
  SELECT post_id INTO v_post_id FROM social_post_variants
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.variant_id ELSE NEW.variant_id END;
  IF v_post_id IS NULL THEN IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  SELECT CASE
      WHEN bool_and(delivery.status IN ('sent', 'skipped')) THEN 'published'::social_post_status
      WHEN bool_or(delivery.status IN ('scheduled', 'due', 'processing', 'provider_processing')) THEN 'scheduled'::social_post_status
      WHEN bool_or(delivery.status = 'failed') THEN 'failed'::social_post_status
      ELSE 'draft'::social_post_status END,
    MIN(delivery.scheduled_at) FILTER (WHERE delivery.status IN ('scheduled', 'due', 'processing', 'provider_processing', 'failed')),
    (array_agg(delivery.time_slot ORDER BY delivery.scheduled_at)
      FILTER (WHERE delivery.status IN ('scheduled', 'due', 'processing', 'provider_processing', 'failed')))[1]
    INTO v_status, v_scheduled_at, v_time_slot
    FROM social_post_variants variant JOIN social_deliveries delivery ON delivery.variant_id = variant.id
   WHERE variant.post_id = v_post_id;
  IF v_status IS NOT NULL THEN
    UPDATE social_posts SET status = v_status, scheduled_at = v_scheduled_at, time_slot = v_time_slot
     WHERE id = v_post_id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION mark_social_delivery_provider_processing(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_social_delivery_provider_processing(UUID, TEXT, TEXT) TO service_role;
