BEGIN;
ALTER TABLE public.social_campaigns ADD COLUMN launch_occurrence_id uuid REFERENCES public.event_occurrences(id) ON DELETE SET NULL;

-- Link existing reminder history without deleting or recreating posts. Ambiguous
-- mappings are deliberately left for reconciliation, never guessed by title.
CREATE FUNCTION public.link_legacy_event_campaign_occurrences(p_event_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  WITH matches AS (
    SELECT co.id, min(o.id::text)::uuid AS occurrence_id
    FROM social_campaign_occurrences co JOIN social_campaigns c ON c.id=co.campaign_id
    JOIN event_schedules s ON s.event_id=c.event_id
    JOIN event_occurrences o ON o.schedule_id=s.id AND o.start_at=co.event_occurrence_at AND NOT o.superseded
    WHERE c.event_id=p_event_id AND co.event_occurrence_id IS NULL GROUP BY co.id HAVING count(*)=1
  )
  UPDATE social_campaign_occurrences co SET event_occurrence_id=matches.occurrence_id FROM matches WHERE co.id=matches.id;
  UPDATE social_campaign_occurrences co SET generation_key=c.id::text || ':' || co.event_occurrence_id::text || ':' || regexp_replace(co.generation_key,'^.*:','')
  FROM social_campaigns c WHERE c.id=co.campaign_id AND c.event_id=p_event_id AND co.event_occurrence_id IS NOT NULL;
  UPDATE social_campaigns c SET launch_occurrence_id = (
    SELECT min(o.id::text)::uuid FROM event_occurrences o JOIN event_schedules s ON s.id=o.schedule_id
    WHERE s.event_id=c.event_id AND o.start_at=c.launch_occurrence_at AND NOT o.superseded HAVING count(*)=1
  ) WHERE c.event_id=p_event_id AND c.launch_occurrence_at IS NOT NULL AND c.launch_occurrence_id IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.link_legacy_event_campaign_occurrences(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_legacy_event_campaign_occurrences(bigint) TO service_role;

-- Preserve the tested post/variant/delivery persistence implementation, but
-- remove the old public entry point that has no event-version check.
ALTER FUNCTION public.persist_social_campaign_proposals(uuid,jsonb,jsonb,date,timestamptz,boolean)
  RENAME TO persist_social_campaign_proposals_internal;
REVOKE ALL ON FUNCTION public.persist_social_campaign_proposals_internal(uuid,jsonb,jsonb,date,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.persist_event_campaign_proposals(
  p_campaign_id uuid, p_event_version integer, p_proposals jsonb, p_suppressed jsonb,
  p_generated_through date, p_launch_occurrence_id uuid, p_launch_decision_made boolean
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c social_campaigns%ROWTYPE; e events%ROWTYPE; inserted integer; launch_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT has_perm('social','schedule') THEN RAISE EXCEPTION 'Permission denied: social.schedule'; END IF;
  SELECT * INTO e FROM events WHERE id=(SELECT event_id FROM social_campaigns WHERE id=p_campaign_id) FOR SHARE;
  SELECT * INTO c FROM social_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF c.id IS NULL OR c.event_id IS DISTINCT FROM e.id OR c.status<>'active' OR NOT c.generation_enabled OR c.needs_review THEN
    RAISE EXCEPTION 'Campaign changed. Reload before generating.';
  END IF;
  IF e.publication_status<>'published' OR e.version<>p_event_version THEN RAISE EXCEPTION 'Event changed or is not published. Reload before generating.'; END IF;
  IF c.generated_through >= p_generated_through THEN RETURN 0; END IF;
  PERFORM link_legacy_event_campaign_occurrences(e.id);
  IF EXISTS(SELECT 1 FROM social_campaign_occurrences WHERE campaign_id=c.id AND event_occurrence_id IS NULL AND event_occurrence_at IS NOT NULL AND event_occurrence_at>=now()) THEN
    RAISE EXCEPTION 'Existing reminder sessions need reconciliation before generation. No posts were changed.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_proposals) p WHERE NOT EXISTS(
    SELECT 1 FROM event_occurrences o JOIN event_schedules s ON s.id=o.schedule_id
    WHERE o.id=(p->>'eventOccurrenceId')::uuid AND s.event_id=e.id AND NOT o.cancelled AND NOT o.superseded AND NOT s.cancelled
      AND o.start_at=(p->>'eventOccurrenceAt')::timestamptz
  )) THEN RAISE EXCEPTION 'A generated session changed. Reload before generating.'; END IF;
  SELECT o.start_at INTO launch_at FROM event_occurrences o JOIN event_schedules s ON s.id=o.schedule_id
    WHERE o.id=p_launch_occurrence_id AND s.event_id=e.id;
  IF p_launch_occurrence_id IS NOT NULL AND launch_at IS NULL THEN RAISE EXCEPTION 'Invalid launch session.'; END IF;
  inserted := persist_social_campaign_proposals_internal(c.id,p_proposals,p_suppressed,p_generated_through,launch_at,p_launch_decision_made);
  UPDATE social_campaign_occurrences co SET event_occurrence_id=(p->>'eventOccurrenceId')::uuid
    FROM jsonb_array_elements(p_proposals) p WHERE co.campaign_id=c.id AND co.generation_key=p->>'generationKey';
  UPDATE social_campaigns SET launch_occurrence_id=p_launch_occurrence_id WHERE id=c.id;
  RETURN inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_event_campaign_proposals(uuid,integer,jsonb,jsonb,date,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.persist_event_campaign_proposals(uuid,integer,jsonb,jsonb,date,uuid,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.preserve_social_campaigns_before_event_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM open_current_social_campaign_review(OLD.id,'The linked event was deleted.',social_event_snapshot(OLD.id)||'{"deleted":true}'::jsonb);
  UPDATE social_campaigns SET generation_enabled=false,status=CASE WHEN status IN ('active','paused') THEN 'draft' ELSE status END WHERE event_id=OLD.id;
  RETURN OLD;
END;
$$;

-- Public recurrence data is legacy-only and must not reveal draft-event timing.
DROP POLICY recurrence_public_select ON public.recurrence_rule;
CREATE POLICY recurrence_public_select ON public.recurrence_rule FOR SELECT TO anon,authenticated
  USING (EXISTS(SELECT 1 FROM public.events e WHERE e.recurrence_rule_id=recurrence_rule.id));
REVOKE INSERT,UPDATE,DELETE ON public.recurrence_rule FROM authenticated;
CREATE OR REPLACE FUNCTION claim_social_deliveries(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  delivery_id UUID, platform social_schedule_platform, channel social_variant_channel,
  caption TEXT, description TEXT, media_items JSONB, attempt_number SMALLINT,
  idempotency_key TEXT, external_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  max_delivery_attempts CONSTANT smallint := 3;
  max_claim_batch_size CONSTANT integer := 100;
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
       AND (delivery.status = 'provider_processing' OR (campaign.status = 'active'
         AND NOT campaign.needs_review
         AND (campaign.event_id IS NULL OR EXISTS (SELECT 1 FROM events e WHERE e.id=campaign.event_id AND e.publication_status='published'))))
       AND delivery.retryable = TRUE
       AND (delivery.status = 'provider_processing' OR delivery.attempt_count < max_delivery_attempts)
       AND delivery.next_attempt_at <= NOW()
       AND (delivery.schedule_platform <> 'tiktok' OR delivery.publication_consented_at IS NOT NULL)
     ORDER BY delivery.next_attempt_at, delivery.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, LEAST(p_limit, max_claim_batch_size))
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


COMMIT;
