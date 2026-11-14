BEGIN;

-- Reuse the existing campaign trigger and slot index; no duplicated archive state.
CREATE OR REPLACE FUNCTION public.social_campaign_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  NEW.version:=OLD.version+1;
  IF ROW(NEW.event_id,NEW.starts_on,NEW.ends_on,NEW.default_channels) IS DISTINCT FROM ROW(OLD.event_id,OLD.starts_on,OLD.ends_on,OLD.default_channels)
     OR (NEW.needs_review AND (NOT OLD.needs_review OR ROW(NEW.current_event_snapshot,NEW.review_reason) IS DISTINCT FROM ROW(OLD.current_event_snapshot,OLD.review_reason))) THEN
    NEW.generated_through:=NULL; NEW.next_generation_at:=now();
    -- The archive branch below handles cancellation in one update.
    IF NEW.status <> 'archived' THEN
      UPDATE social_posts SET status='draft',scheduled_at=NULL,next_attempt_at=NULL,
        publication_consented_at=NULL,publication_consented_by=NULL,needs_review=true,
        review_reason=COALESCE(NEW.review_reason,'Campaign settings changed.')
      WHERE campaign_id=NEW.id AND status IN ('draft','proposed','scheduled','due','failed');
    END IF;
  END IF;
  IF OLD.needs_review AND NOT NEW.needs_review AND NOT has_perm('social','publish') AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied: social.publish';
  END IF;
  -- Archiving cancels pending publication; in-flight provider work must finish.
  IF NEW.status='archived' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE social_posts SET status='cancelled', scheduled_at=NULL, next_attempt_at=NULL,
      publication_consented_at=NULL, publication_consented_by=NULL, retryable=false
    WHERE campaign_id=NEW.id AND status IN ('draft','proposed','scheduled','due','failed');
  END IF;
  RETURN NEW;
END $$;

-- Release reservations left behind by previously archived campaigns.
UPDATE public.social_posts p SET status='cancelled', scheduled_at=NULL, next_attempt_at=NULL,
  publication_consented_at=NULL, publication_consented_by=NULL, retryable=false
FROM public.social_campaigns c
WHERE c.id=p.campaign_id AND c.status='archived'
  AND p.status IN ('draft','proposed','scheduled','due','failed');

COMMIT;
