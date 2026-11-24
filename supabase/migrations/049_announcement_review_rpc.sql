-- All review decisions require an expected revision, including direct API calls.
BEGIN;
REVOKE UPDATE ON public.announcements FROM authenticated;
GRANT UPDATE (title,description,poster_url,poster_alt,call_to_action_link,call_to_action_caption,publish_at,expires_at,display_order)
 ON public.announcements TO authenticated;
CREATE FUNCTION public.transition_announcement_review(p_id bigint,p_revision integer,p_action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_state text; result_revision integer;
BEGIN
 IF p_id IS NULL OR p_id<=0 OR p_revision IS NULL OR p_revision<=0 THEN
   RAISE EXCEPTION 'Invalid announcement revision.' USING ERRCODE='22023';
 END IF;
 target_state := CASE p_action WHEN 'submit' THEN 'pending' WHEN 'approve' THEN 'approved'
   WHEN 'reject' THEN 'draft' WHEN 'withdraw' THEN 'withdrawn' WHEN 'reopen' THEN 'draft' ELSE NULL END;
 IF target_state IS NULL THEN RAISE EXCEPTION 'Invalid review action.' USING ERRCODE='22023'; END IF;
 IF NOT public.has_perm('announcements',CASE WHEN p_action IN ('submit','reopen') THEN 'edit' ELSE 'publish' END) THEN
   RAISE EXCEPTION 'Permission denied.' USING ERRCODE='42501';
 END IF;
 UPDATE public.announcements SET review_state=target_state
   WHERE id=p_id AND revision=p_revision RETURNING revision INTO result_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'Announcement changed or is unavailable. Reload and try again.' USING ERRCODE='40001'; END IF;
 RETURN result_revision;
END $$;
REVOKE ALL ON FUNCTION public.transition_announcement_review(bigint,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_announcement_review(bigint,integer,text) TO authenticated;
COMMIT;
