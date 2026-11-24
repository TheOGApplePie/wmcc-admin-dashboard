-- An interrupted or held delivery requires a publisher's evidence before another send.
BEGIN;
ALTER TABLE public.social_posts ADD COLUMN reconciliation_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_reconciliation_hold CHECK (
  NOT reconciliation_required OR (status='failed' AND NOT retryable AND next_attempt_at IS NULL)
);
CREATE FUNCTION public.guard_unreconciled_social_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.reconciliation_required THEN RAISE EXCEPTION 'Reconcile this delivery before deleting it.' USING ERRCODE='55000'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER guard_unreconciled_social_delete BEFORE DELETE ON public.social_posts
 FOR EACH ROW EXECUTE FUNCTION public.guard_unreconciled_social_delete();

CREATE OR REPLACE FUNCTION public.recover_stuck_social_posts(p_stale_before timestamptz)
RETURNS TABLE(delivery_id uuid,platform public.social_schedule_platform,attempt_number smallint,terminal boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.' USING ERRCODE='42501'; END IF;
 IF p_stale_before IS NULL THEN RAISE EXCEPTION 'A recovery cutoff is required.' USING ERRCODE='22023'; END IF;
 RETURN QUERY UPDATE public.social_posts p SET status='failed',retryable=false,next_attempt_at=NULL,
   reconciliation_required=true,needs_review=true,
   review_reason='Delivery was interrupted. Confirm its outcome with the provider before retrying.',
   provider_error='The worker stopped before recording the provider outcome.'
 WHERE p.status='processing' AND p.last_attempt_at < p_stale_before
 RETURNING p.id,p.schedule_platform,p.attempt_count,true;
END $$;
REVOKE ALL ON FUNCTION public.recover_stuck_social_posts(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stuck_social_posts(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hold_overdue_social_posts_on_resume() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.status='paused' AND NEW.status='active' THEN
   UPDATE public.social_posts SET
     status=CASE WHEN status='scheduled' THEN 'draft'::public.social_post_status ELSE status END,
     scheduled_at=CASE WHEN status='scheduled' THEN NULL ELSE scheduled_at END,
     next_attempt_at=NULL,
     publication_consented_at=CASE WHEN status='scheduled' THEN NULL ELSE publication_consented_at END,
     publication_consented_by=CASE WHEN status='scheduled' THEN NULL ELSE publication_consented_by END,
     reconciliation_required=(status='failed'),
     retryable=CASE WHEN status='failed' THEN false ELSE retryable END,
     needs_review=true,
     review_reason=CASE WHEN status='failed' THEN 'Confirm the provider outcome before retrying.' ELSE 'This post became overdue while the campaign was paused. Review before rescheduling.' END
   WHERE campaign_id=NEW.id AND status IN ('scheduled','failed') AND scheduled_at<=now();
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.reconcile_social_post(p_id uuid,p_version integer,p_outcome text,p_evidence text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.social_posts%ROWTYPE;
BEGIN
 IF NOT public.has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL OR p_version IS NULL OR p_version<=0 OR p_outcome NOT IN ('sent','draft') OR p_outcome IS NULL
   OR length(btrim(COALESCE(p_evidence,''))) NOT BETWEEN 5 AND 500 THEN
   RAISE EXCEPTION 'Provide an outcome and a brief explanation of the evidence.' USING ERRCODE='22023';
 END IF;
 SELECT * INTO p FROM public.social_posts WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR p.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Post changed. Reload and try again.' USING ERRCODE='40001'; END IF;
 IF p.status<>'failed' OR NOT p.reconciliation_required THEN RAISE EXCEPTION 'This post does not require reconciliation.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.audit_logs(user_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'social_post',p.id::text,'reconcile_'||p_outcome,
   jsonb_build_object('evidence',btrim(p_evidence),'previous_provider_id',p.external_id,'attempts',p.attempt_count)::text);
 UPDATE public.social_posts SET reconciliation_required=false,retryable=false,next_attempt_at=NULL,
   status=CASE WHEN p_outcome='sent' THEN 'sent'::public.social_post_status ELSE 'draft'::public.social_post_status END,
   sent_at=CASE WHEN p_outcome='sent' THEN now() ELSE NULL END,
   sent_by=CASE WHEN p_outcome='sent' THEN auth.uid() ELSE NULL END,
   scheduled_at=CASE WHEN p_outcome='draft' THEN NULL ELSE scheduled_at END,
   publication_consented_at=CASE WHEN p_outcome='draft' THEN NULL ELSE publication_consented_at END,
   publication_consented_by=CASE WHEN p_outcome='draft' THEN NULL ELSE publication_consented_by END,
   external_id=CASE WHEN p_outcome='draft' THEN NULL ELSE external_id END,
   provider_processing_started_at=CASE WHEN p_outcome='draft' THEN NULL ELSE provider_processing_started_at END,
   needs_review=(p_outcome='draft'),review_reason=CASE WHEN p_outcome='draft' THEN 'Confirmed not sent; choose a new time and approve before publication.' ELSE NULL END
 WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_social_post(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_social_post(uuid,integer,text,text) TO authenticated;
COMMIT;
