-- Schedule/rule authoring. No occurrence ETL or removal of old tables.
BEGIN;
ALTER TABLE public.event_schedules ADD COLUMN IF NOT EXISTS recurrence_rule_id bigint REFERENCES public.recurrence_rule(id);
CREATE TABLE public.event_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  source_schedule_id uuid NOT NULL REFERENCES public.event_schedules(id) ON DELETE CASCADE,
  source_rule_id bigint NOT NULL REFERENCES public.recurrence_rule(id),
  excluded_date date NOT NULL,
  replacement_schedule_id uuid UNIQUE REFERENCES public.event_schedules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_schedule_id, excluded_date),
  CHECK (replacement_schedule_id IS DISTINCT FROM source_schedule_id)
);
ALTER TABLE public.event_schedule_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_exceptions_read ON public.event_schedule_exceptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id=event_id) AND
    (has_perm('events','view') OR has_perm('events','edit')));
REVOKE ALL ON public.event_schedule_exceptions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.event_schedule_exceptions TO authenticated;
DROP POLICY IF EXISTS recurrence_public_select ON public.recurrence_rule;
CREATE POLICY recurrence_public_select ON public.recurrence_rule FOR SELECT TO anon,authenticated
  USING (EXISTS (SELECT 1 FROM public.event_schedules s WHERE s.recurrence_rule_id=recurrence_rule.id));

-- Internal helpers are callable only through the permission-checked mutation RPC.
CREATE FUNCTION public.write_schedule_rule(p_rule jsonb, p_zone text) RETURNS bigint
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r recurrence_rule%ROWTYPE; rule_id bigint;
BEGIN
  IF p_rule IS NULL OR p_rule='null'::jsonb THEN RETURN NULL; END IF;
  SELECT * INTO r FROM jsonb_populate_record(NULL::recurrence_rule,p_rule);
  IF r.frequency NOT IN ('daily','weekly','monthly') OR COALESCE(r.interval,1)<1
    OR (r.count IS NULL)=(r.until IS NULL) OR r.count<1 THEN RAISE EXCEPTION 'Invalid recurrence rule.'; END IF;
  INSERT INTO recurrence_rule(frequency,interval,by_weekdays,by_month_day,by_set_position,until,count,exdates)
  VALUES(r.frequency,COALESCE(r.interval,1),r.by_weekdays,r.by_month_day,r.by_set_position,
    CASE WHEN r.until IS NOT NULL THEN ((left(p_rule->>'until',10)::date+1)::timestamp AT TIME ZONE p_zone)-interval '1 microsecond' END,
    r.count,COALESCE(r.exdates,'{}')) RETURNING id INTO rule_id;
  RETURN rule_id;
END;
$$;
CREATE FUNCTION public.delete_unused_schedule_rule(p_id bigint) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  DELETE FROM recurrence_rule r WHERE r.id=p_id
    AND NOT EXISTS(SELECT 1 FROM event_schedules s WHERE s.recurrence_rule_id=r.id)
    AND NOT EXISTS(SELECT 1 FROM events e WHERE e.recurrence_rule_id=r.id)
    AND NOT EXISTS(SELECT 1 FROM event_schedule_exceptions x WHERE x.source_rule_id=r.id);
END;
$$;
CREATE FUNCTION public.remove_schedule_internal(p_id uuid, p_restore boolean) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s event_schedules%ROWTYPE; x event_schedule_exceptions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM event_schedules WHERE id=p_id FOR UPDATE;
  SELECT * INTO x FROM event_schedule_exceptions WHERE replacement_schedule_id=p_id FOR UPDATE;
  IF x.id IS NOT NULL AND p_restore THEN
    UPDATE recurrence_rule SET exdates=array_remove(exdates,x.excluded_date::text) WHERE id=x.source_rule_id;
    UPDATE event_schedules SET version=version+1 WHERE id=x.source_schedule_id;
    DELETE FROM event_schedule_exceptions WHERE id=x.id;
  END IF;
  DELETE FROM event_schedules WHERE id=p_id;
  PERFORM delete_unused_schedule_rule(s.recurrence_rule_id);
END;
$$;
CREATE FUNCTION public.mutate_schedule_internal(p_event_id bigint, p_operation text, p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s event_schedules%ROWTYPE; x event_schedule_exceptions%ROWTYPE;
  f jsonb:=p_payload->'fields'; new_id uuid; rule_id bigint; old_rule bigint;
  selected_date date; split_day date; rule_json jsonb;
BEGIN
  IF p_payload->>'id' IS NOT NULL THEN
    SELECT * INTO s FROM event_schedules WHERE id=(p_payload->>'id')::uuid AND event_id=p_event_id FOR UPDATE;
    IF NOT FOUND OR s.version IS DISTINCT FROM (p_payload->>'version')::integer THEN
      RAISE EXCEPTION 'Schedule changed. Reload before saving.';
    END IF;
  ELSIF p_operation<>'save_schedule' THEN RAISE EXCEPTION 'Schedule required.';
  END IF;
  IF s.recurrence_rule_id IS NOT NULL AND EXISTS(SELECT 1 FROM event_schedules other WHERE other.recurrence_rule_id=s.recurrence_rule_id AND other.id<>s.id) THEN
    RAISE EXCEPTION 'This rule is shared by multiple schedules. Give each schedule its own rule before editing.';
  END IF;
  IF p_operation='remove_schedule' THEN
    PERFORM remove_schedule_internal(s.id,COALESCE((p_payload->>'restore_original')::boolean,false));
    RETURN NULL;
  END IF;
  IF p_operation='exception' THEN
    selected_date:=(p_payload->>'original_date')::date;
    IF s.recurrence_rule_id IS NULL OR selected_date IS NULL THEN RAISE EXCEPTION 'Select a recurring schedule and date.'; END IF;
    SELECT * INTO x FROM event_schedule_exceptions WHERE source_schedule_id=s.id AND excluded_date=selected_date FOR UPDATE;
    IF p_payload->>'action'='restore' THEN
      IF x.replacement_schedule_id IS NOT NULL THEN PERFORM remove_schedule_internal(x.replacement_schedule_id,false); END IF;
      UPDATE recurrence_rule SET exdates=array_remove(exdates,selected_date::text) WHERE id=s.recurrence_rule_id;
      DELETE FROM event_schedule_exceptions WHERE source_schedule_id=s.id AND excluded_date=selected_date;
    ELSIF p_payload->>'action' IN ('cancel','edit') THEN
      IF x.id IS NOT NULL OR EXISTS(SELECT 1 FROM recurrence_rule WHERE id=s.recurrence_rule_id AND selected_date::text=ANY(exdates)) THEN
        RAISE EXCEPTION 'This date is already excluded. Restore it or edit its replacement schedule.';
      END IF;
      UPDATE recurrence_rule SET exdates=array_append(COALESCE(exdates,'{}'),selected_date::text) WHERE id=s.recurrence_rule_id;
      IF p_payload->>'action'='edit' THEN
        INSERT INTO event_schedules(event_id,label,start_at,end_at,time_zone,poster_url,poster_alt,location)
        VALUES(p_event_id,s.label,(p_payload->>'start_at')::timestamptz,(p_payload->>'end_at')::timestamptz,s.time_zone,s.poster_url,s.poster_alt,s.location)
        RETURNING id INTO new_id;
      END IF;
      INSERT INTO event_schedule_exceptions(event_id,source_schedule_id,source_rule_id,excluded_date,replacement_schedule_id)
      VALUES(p_event_id,s.id,s.recurrence_rule_id,selected_date,new_id);
    ELSE RAISE EXCEPTION 'Unknown exception action.';
    END IF;
    UPDATE event_schedules SET version=version+1 WHERE id=s.id;
    RETURN new_id;
  END IF;
  split_day:=(p_payload->>'split_from')::date;
  IF split_day=(s.start_at AT TIME ZONE s.time_zone)::date THEN split_day:=NULL; END IF;
  IF split_day IS NOT NULL THEN
    IF s.recurrence_rule_id IS NULL OR split_day<=(s.start_at AT TIME ZONE s.time_zone)::date THEN RAISE EXCEPTION 'Choose a later recurring date.'; END IF;
    UPDATE recurrence_rule SET count=NULL,until=(split_day::timestamp AT TIME ZONE s.time_zone)-interval '1 microsecond'
      WHERE id=s.recurrence_rule_id;
    UPDATE event_schedules SET version=version+1 WHERE id=s.id;
  END IF;
  rule_json:=f->'recurrence_rule';
  -- Exclusions are changed through the exception operation; stale forms cannot erase them.
  IF s.id IS NOT NULL AND s.recurrence_rule_id IS NOT NULL AND rule_json<>'null'::jsonb THEN
    rule_json:=rule_json || jsonb_build_object('exdates',(SELECT to_jsonb(COALESCE(exdates,'{}')) FROM recurrence_rule WHERE id=s.recurrence_rule_id));
  END IF;
  IF s.id IS NOT NULL AND split_day IS NULL AND (rule_json IS NULL OR rule_json='null'::jsonb)
    AND EXISTS(SELECT 1 FROM event_schedule_exceptions WHERE source_schedule_id=s.id) THEN
    RAISE EXCEPTION 'Restore excluded dates before changing this schedule to one date.';
  END IF;
  rule_id:=write_schedule_rule(rule_json,COALESCE(f->>'time_zone','America/Toronto'));
  IF s.id IS NULL OR split_day IS NOT NULL THEN
    INSERT INTO event_schedules(event_id,label,start_at,end_at,time_zone,recurrence_rule_id,poster_url,poster_alt,location)
    VALUES(p_event_id,COALESCE(f->>'label',''),(f->>'start_at')::timestamptz,(f->>'end_at')::timestamptz,
      COALESCE(f->>'time_zone','America/Toronto'),rule_id,f->>'poster_url',COALESCE(f->>'poster_alt',''),f->>'location') RETURNING id INTO new_id;
    IF split_day IS NOT NULL THEN
      IF rule_id IS NULL AND EXISTS(SELECT 1 FROM event_schedule_exceptions WHERE source_schedule_id=s.id AND excluded_date>=split_day) THEN
        RAISE EXCEPTION 'Restore following exclusions before replacing the series with one date.';
      END IF;
      UPDATE event_schedule_exceptions SET source_schedule_id=new_id,source_rule_id=rule_id WHERE source_schedule_id=s.id AND excluded_date>=split_day;
      UPDATE recurrence_rule SET exdates=ARRAY(SELECT d FROM unnest(exdates) d WHERE d::date<split_day) WHERE id=s.recurrence_rule_id;
      UPDATE recurrence_rule SET exdates=ARRAY(SELECT d FROM unnest(exdates) d WHERE d::date>=split_day) WHERE id=rule_id;
    END IF;
  ELSE
    new_id:=s.id; old_rule:=s.recurrence_rule_id;
    UPDATE event_schedules SET label=COALESCE(f->>'label',''),start_at=(f->>'start_at')::timestamptz,end_at=(f->>'end_at')::timestamptz,
      time_zone=COALESCE(f->>'time_zone','America/Toronto'),recurrence_rule_id=rule_id,poster_url=f->>'poster_url',poster_alt=COALESCE(f->>'poster_alt',''),
      location=f->>'location',version=version+1 WHERE id=s.id;
    UPDATE event_schedule_exceptions SET source_rule_id=rule_id WHERE source_schedule_id=s.id;
    PERFORM delete_unused_schedule_rule(old_rule);
  END IF;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.write_schedule_rule(jsonb,text), public.delete_unused_schedule_rule(bigint),
  public.remove_schedule_internal(uuid,boolean), public.mutate_schedule_internal(bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.mutate_event(p_operation text, p_payload jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_variable
DECLARE e events%ROWTYPE; s event_schedules%ROWTYPE;
  previous event_mutation_requests%ROWTYPE; f jsonb; result jsonb; event_id bigint; new_schedule uuid; split_day date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF p_operation IN ('status') THEN
    IF NOT has_perm('events', 'publish') THEN RAISE EXCEPTION 'Permission denied: events.publish'; END IF;
  ELSIF p_operation = 'delete' THEN
    IF NOT has_perm('events', 'delete') THEN RAISE EXCEPTION 'Permission denied: events.delete'; END IF;
  ELSIF NOT has_perm('events', 'edit') THEN RAISE EXCEPTION 'Permission denied: events.edit'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO previous FROM event_mutation_requests WHERE request_id = p_request_id;
  IF FOUND THEN
    IF previous.actor <> auth.uid() OR previous.operation <> p_operation OR previous.payload <> p_payload THEN
      RAISE EXCEPTION 'Request ID already used for different changes.';
    END IF;
    RETURN previous.result;
  END IF;
  event_id := NULLIF(p_payload->>'event_id', '')::bigint;
  IF event_id IS NOT NULL THEN
    SELECT * INTO e FROM events WHERE id = event_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Event no longer exists.'; END IF;
  END IF;
  f := p_payload->'fields';
  IF p_operation = 'save_event' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(f->>'navigation_slug'), 1));
    IF (event_id IS NULL OR lower(e.navigation_slug) IS DISTINCT FROM lower(f->>'navigation_slug')) AND EXISTS (
      SELECT 1 FROM events WHERE lower(navigation_slug) = lower(f->>'navigation_slug') AND id IS DISTINCT FROM event_id
    ) THEN RAISE EXCEPTION 'This public URL is already used by another event.'; END IF;
    IF event_id IS NULL THEN
      INSERT INTO events(title, description, location, poster_url, poster_alt, navigation_slug,
        call_to_action_link, call_to_action_caption, gallery_url, is_recurring, publication_status)
      VALUES(f->>'title', f->>'description', f->>'location', f->>'poster_url', COALESCE(f->>'poster_alt',''), f->>'navigation_slug',
        f->>'call_to_action_link', f->>'call_to_action_caption', f->>'gallery_url', false, 'draft') RETURNING id INTO event_id;
    ELSE
      IF e.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Event changed. Reload before saving.'; END IF;
      UPDATE events SET title=f->>'title', description=f->>'description', location=f->>'location', poster_url=f->>'poster_url',
        poster_alt=COALESCE(f->>'poster_alt',''), navigation_slug=f->>'navigation_slug', call_to_action_link=f->>'call_to_action_link',
        call_to_action_caption=f->>'call_to_action_caption', gallery_url=f->>'gallery_url', version=version+1 WHERE id=event_id;
    END IF;
  ELSIF p_operation IN ('save_schedule','exception','remove_schedule') THEN
    IF event_id IS NULL THEN RAISE EXCEPTION 'Event required.'; END IF;
    new_schedule:=mutate_schedule_internal(event_id,p_operation,p_payload);
    UPDATE events SET version=version+1 WHERE id=event_id;
  ELSIF p_operation = 'status' THEN
    IF e.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Event changed. Reload before publishing.'; END IF;
    UPDATE events SET publication_status=p_payload->>'status', version=version+1 WHERE id=event_id;
  ELSIF p_operation = 'delete' THEN
    IF e.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Event changed. Reload before deleting.'; END IF;
    IF EXISTS(SELECT 1 FROM social_campaigns WHERE social_campaigns.event_id=e.id) THEN RAISE EXCEPTION 'Archive this event to preserve its linked campaign and history.'; END IF;
    DELETE FROM events WHERE id=event_id;
  ELSE RAISE EXCEPTION 'Unknown event operation.';
  END IF;
  IF p_operation <> 'delete' THEN
    PERFORM open_current_social_campaign_review(event_id,'The linked event content or schedule changed.');
    UPDATE social_campaigns SET generated_through=NULL, next_generation_at=now() WHERE social_campaigns.event_id=event_id;
  END IF;
  result := jsonb_build_object('id',event_id,'schedule_id',new_schedule);
  INSERT INTO event_mutation_requests VALUES(p_request_id,auth.uid(),p_operation,p_payload,result,now());
  INSERT INTO audit_logs(user_id,user_email,entity_type,entity_id,action,detail)
    VALUES(auth.uid(),auth.jwt()->>'email','event',event_id::text,p_operation,p_payload::text);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_event(text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_event(text,jsonb,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.social_event_snapshot(p_event_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('event_id',e.id,'title',e.title,'description',e.description,'poster_url',e.poster_url,
    'call_to_action_link',e.call_to_action_link,'call_to_action_caption',e.call_to_action_caption,
    'publication_status',e.publication_status,'version',e.version,
    'schedules',COALESCE((SELECT jsonb_agg((to_jsonb(s)-'recurrence'-'materialized_version') ||
      jsonb_build_object('recurrence_rule',to_jsonb(r)) ORDER BY s.id)
      FROM event_schedules s LEFT JOIN recurrence_rule r ON r.id=s.recurrence_rule_id WHERE s.event_id=e.id),'[]'))
  FROM events e WHERE e.id=p_event_id;
$$;
COMMIT;
