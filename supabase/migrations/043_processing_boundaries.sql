-- Keep recipient permissions and event-option eligibility in the database.
BEGIN;
CREATE OR REPLACE FUNCTION public.notify_social_publishers(
  p_type text, p_title text, p_body text, p_entity_type text, p_entity_id text
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  INSERT INTO notifications(user_id,type,title,body,entity_type,entity_id)
  SELECT id,p_type,p_title,p_body,p_entity_type,p_entity_id
  FROM profiles WHERE status='active' AND has_permission_for_user(id,'social','publish');
$$;
REVOKE ALL ON FUNCTION public.notify_social_publishers(text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notify_social_publishers(text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.campaign_event_options(p_campaign_id uuid DEFAULT NULL)
RETURNS TABLE(id bigint,title text,publication_status text,is_recurring boolean,campaign_id uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NOT has_perm('social','edit') THEN RAISE EXCEPTION 'Permission denied'; END IF;
  RETURN QUERY SELECT e.id,e.title::text,e.publication_status::text,
    count(s.id) > 1 OR coalesce(bool_or(s.recurrence_rule_id IS NOT NULL),false), c.id
  FROM events e
  LEFT JOIN social_campaigns c ON c.event_id=e.id
  LEFT JOIN event_schedules s ON s.event_id=e.id
  WHERE c.id IS NULL OR c.id=p_campaign_id
  GROUP BY e.id,e.title,e.publication_status,c.id
  ORDER BY e.title,e.id;
END;
$$;
REVOKE ALL ON FUNCTION public.campaign_event_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.campaign_event_options(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS social_posts_calendar_date_id_idx ON public.social_posts(scheduled_date,id) WHERE status <> 'cancelled';
COMMIT;
