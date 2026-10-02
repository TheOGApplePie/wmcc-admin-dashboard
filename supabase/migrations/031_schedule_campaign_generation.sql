BEGIN;
ALTER TABLE public.social_campaign_occurrences ADD COLUMN event_schedule_id uuid REFERENCES public.event_schedules(id) ON DELETE SET NULL;
ALTER TABLE public.social_campaigns ADD COLUMN launch_schedule_id uuid REFERENCES public.event_schedules(id) ON DELETE SET NULL;
CREATE INDEX social_campaign_schedule_idx ON public.social_campaign_occurrences(event_schedule_id);
CREATE FUNCTION public.persist_schedule_campaign_proposals(
  p_campaign_id uuid, p_event_version integer, p_proposals jsonb, p_suppressed jsonb,
  p_generated_through date, p_launch_schedule_id uuid, p_launch_at timestamptz, p_launch_decision_made boolean
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c social_campaigns%ROWTYPE; e events%ROWTYPE; inserted integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT has_perm('social','schedule') THEN RAISE EXCEPTION 'Permission denied: social.schedule'; END IF;
  SELECT * INTO e FROM events WHERE id=(SELECT event_id FROM social_campaigns WHERE id=p_campaign_id) FOR SHARE;
  SELECT * INTO c FROM social_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF c.id IS NULL OR e.id IS NULL OR c.event_id IS DISTINCT FROM e.id OR c.status<>'active' OR NOT c.generation_enabled OR c.needs_review THEN
    RAISE EXCEPTION 'Campaign changed. Reload before generating.';
  END IF;
  IF e.publication_status<>'published' OR e.version<>p_event_version THEN RAISE EXCEPTION 'Event changed or is not published. Reload before generating.'; END IF;
  IF c.generated_through >= p_generated_through THEN RETURN 0; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_proposals) p WHERE NOT EXISTS(
    SELECT 1 FROM event_schedules s WHERE s.id=(p->>'eventScheduleId')::uuid AND s.event_id=e.id
  )) THEN RAISE EXCEPTION 'A source schedule changed. Reload before generating.'; END IF;
  IF p_launch_schedule_id IS NOT NULL AND (p_launch_at IS NULL OR NOT EXISTS(
    SELECT 1 FROM event_schedules WHERE id=p_launch_schedule_id AND event_id=e.id
  )) THEN RAISE EXCEPTION 'Invalid launch schedule.'; END IF;
  inserted:=persist_social_campaign_proposals_internal(c.id,p_proposals,p_suppressed,p_generated_through,p_launch_at,p_launch_decision_made);
  UPDATE social_campaign_occurrences co SET event_schedule_id=(p->>'eventScheduleId')::uuid
    FROM jsonb_array_elements(p_proposals) p WHERE co.campaign_id=c.id AND co.generation_key=p->>'generationKey';
  UPDATE social_campaigns SET launch_schedule_id=p_launch_schedule_id WHERE id=c.id;
  RETURN inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_schedule_campaign_proposals(uuid,integer,jsonb,jsonb,date,uuid,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.persist_schedule_campaign_proposals(uuid,integer,jsonb,jsonb,date,uuid,timestamptz,boolean) TO authenticated,service_role;
COMMIT;
