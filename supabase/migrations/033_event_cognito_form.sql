-- An event can supply a Cognito form ID or a complete CTA button.
BEGIN;
ALTER TABLE public.events ADD COLUMN cognito_form_id text;
-- Normalize optional empty values before enforcing the CTA shape.
UPDATE public.events SET call_to_action_link=NULLIF(btrim(call_to_action_link),''),
  call_to_action_caption=NULLIF(btrim(call_to_action_caption),'')
WHERE call_to_action_link IS DISTINCT FROM NULLIF(btrim(call_to_action_link),'')
   OR call_to_action_caption IS DISTINCT FROM NULLIF(btrim(call_to_action_caption),'');
ALTER TABLE public.events
  ADD CONSTRAINT events_cognito_form_id_digits CHECK(cognito_form_id IS NULL OR cognito_form_id ~ '^[0-9]+$'),
  ADD CONSTRAINT events_action_exclusive CHECK(cognito_form_id IS NULL OR (call_to_action_link IS NULL AND call_to_action_caption IS NULL)),
  ADD CONSTRAINT events_cta_pair CHECK((call_to_action_link IS NULL) = (call_to_action_caption IS NULL));

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
        cognito_form_id, call_to_action_link, call_to_action_caption, gallery_url, is_recurring, publication_status)
      VALUES(f->>'title', f->>'description', f->>'location', f->>'poster_url', COALESCE(f->>'poster_alt',''), f->>'navigation_slug',
        NULLIF(btrim(f->>'cognito_form_id'),''), NULLIF(btrim(f->>'call_to_action_link'),''), NULLIF(btrim(f->>'call_to_action_caption'),''), f->>'gallery_url', false, 'draft') RETURNING id INTO event_id;
    ELSE
      IF e.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Event changed. Reload before saving.'; END IF;
      UPDATE events SET title=f->>'title', description=f->>'description', location=f->>'location', poster_url=f->>'poster_url',
        poster_alt=COALESCE(f->>'poster_alt',''), navigation_slug=f->>'navigation_slug', cognito_form_id=NULLIF(btrim(f->>'cognito_form_id'),''), call_to_action_link=NULLIF(btrim(f->>'call_to_action_link'),''),
        call_to_action_caption=NULLIF(btrim(f->>'call_to_action_caption'),''), gallery_url=f->>'gallery_url', version=version+1 WHERE id=event_id;
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
    'cognito_form_id',e.cognito_form_id,'call_to_action_link',e.call_to_action_link,'call_to_action_caption',e.call_to_action_caption,
    'publication_status',e.publication_status,'version',e.version,
    'schedules',COALESCE((SELECT jsonb_agg((to_jsonb(s)-'recurrence'-'materialized_version') ||
      jsonb_build_object('recurrence_rule',to_jsonb(r)) ORDER BY s.id)
      FROM event_schedules s LEFT JOIN recurrence_rule r ON r.id=s.recurrence_rule_id WHERE s.event_id=e.id),'[]'))
  FROM events e WHERE e.id=p_event_id;
$$;
COMMIT;
