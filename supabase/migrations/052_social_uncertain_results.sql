-- Hold provider responses that do not prove whether a publication happened.
BEGIN;
CREATE FUNCTION public.mark_social_delivery_uncertain(p_id uuid,p_provider_id text,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.' USING ERRCODE='42501'; END IF;
 UPDATE public.social_posts SET status='failed',retryable=false,next_attempt_at=NULL,reconciliation_required=true,
   needs_review=true,review_reason='Confirm the provider outcome before retrying.',
   external_id=COALESCE(p_provider_id,external_id),provider_error=LEFT(COALESCE(p_error,'The provider outcome is unknown.'),2000)
 WHERE id=p_id AND status='processing';
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery is no longer processing.' USING ERRCODE='40001'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.mark_social_delivery_uncertain(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_social_delivery_uncertain(uuid,text,text) TO service_role;
COMMIT;
