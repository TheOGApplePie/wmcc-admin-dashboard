-- Apply with the new admin application; run scripts/backfill-event-occurrences.mjs
-- before switching public readers. See docs/event-schedules.md.
BEGIN;

ALTER TABLE public.events
  ADD COLUMN publication_status text NOT NULL DEFAULT 'published'
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE public.events ALTER COLUMN publication_status SET DEFAULT 'draft';
ALTER TABLE public.events ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE public.events ALTER COLUMN end_date DROP NOT NULL;

CREATE TABLE public.event_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
  time_zone text NOT NULL DEFAULT 'America/Toronto' CHECK (time_zone = 'America/Toronto'),
  recurrence jsonb,
  poster_url text, poster_alt text NOT NULL DEFAULT '', location text,
  cancelled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, materialized_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (poster_url IS NULL OR (poster_url ~ '^https://' AND length(btrim(poster_alt)) > 0)),
  CHECK (recurrence IS NULL OR jsonb_typeof(recurrence) = 'object')
);
CREATE INDEX event_schedules_event_idx ON public.event_schedules(event_id);
CREATE TABLE public.event_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.event_schedules(id) ON DELETE CASCADE,
  original_key date NOT NULL,
  generated_start_at timestamptz NOT NULL, generated_end_at timestamptz NOT NULL,
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
  cancelled boolean NOT NULL DEFAULT false, superseded boolean NOT NULL DEFAULT false,
  overridden boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  UNIQUE(schedule_id, original_key), CHECK (end_at > start_at), CHECK (generated_end_at > generated_start_at)
);
CREATE INDEX event_occurrences_range_idx ON public.event_occurrences(start_at, end_at) WHERE NOT superseded;
CREATE INDEX event_occurrences_end_idx ON public.event_occurrences(end_at);
CREATE TABLE public.event_mutation_requests (
  request_id uuid PRIMARY KEY, actor uuid NOT NULL, operation text NOT NULL,
  payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_mutation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_mutation_requests FROM PUBLIC, anon, authenticated;

INSERT INTO public.event_schedules(event_id, label, start_at, end_at, recurrence)
SELECT e.id, 'Original schedule', e.start_date, e.end_date,
  CASE WHEN e.is_recurring THEN jsonb_build_object(
    'frequency', r.frequency, 'interval', r.interval, 'by_weekdays', COALESCE(to_jsonb(r.by_weekdays), '[]'),
    'by_month_day', r.by_month_day, 'by_set_position', COALESCE(to_jsonb(r.by_set_position), '[]'),
    'until', r.until, 'count', r.count, 'exdates', COALESCE(to_jsonb(r.exdates), '[]')) ELSE NULL END
FROM public.events e LEFT JOIN public.recurrence_rule r ON r.id = e.recurrence_rule_id
WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL;

DROP POLICY events_public_select ON public.events;
CREATE POLICY events_public_select ON public.events FOR SELECT TO anon, authenticated
  USING (publication_status = 'published');
CREATE POLICY events_staff_select ON public.events FOR SELECT TO authenticated
  USING (has_perm('events', 'view') OR has_perm('events', 'edit') OR has_perm('events', 'publish')
    OR has_perm('events', 'delete') OR has_perm('social', 'view') OR has_perm('social', 'edit'));
-- New mutations must go through the versioned, atomic API. Legacy writers fail closed.
REVOKE INSERT, UPDATE, DELETE ON public.events FROM authenticated;
ALTER TABLE public.event_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_schedules_read ON public.event_schedules FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));
CREATE POLICY event_occurrences_read ON public.event_occurrences FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.event_schedules s WHERE s.id = schedule_id));
GRANT SELECT ON public.event_schedules, public.event_occurrences TO anon, authenticated;
REVOKE ALL ON public.event_schedules, public.event_occurrences FROM PUBLIC;

CREATE VIEW public.resolved_event_occurrences WITH (security_invoker = true) AS
SELECT o.*, s.event_id, s.cancelled AS schedule_cancelled,
  COALESCE(s.poster_url, e.poster_url) AS poster_url,
  CASE WHEN s.poster_url IS NOT NULL THEN s.poster_alt ELSE e.poster_alt END AS poster_alt,
  COALESCE(s.location, e.location) AS location, e.title, e.description, e.navigation_slug,
  e.call_to_action_link, e.call_to_action_caption, e.gallery_url, e.publication_status
FROM public.event_occurrences o JOIN public.event_schedules s ON s.id = o.schedule_id
JOIN public.events e ON e.id = s.event_id;
GRANT SELECT ON public.resolved_event_occurrences TO anon, authenticated;

-- Internal materialization is also used by the one-time backfill script.
CREATE FUNCTION public.materialize_event_schedule(p_schedule_id uuid, p_version integer, p_occurrences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s event_schedules%ROWTYPE;
  -- Keep aligned with MAX_SCHEDULE_OCCURRENCES in features/events/constants.ts.
  max_schedule_occurrences CONSTANT integer := 5000;
BEGIN
  SELECT * INTO s FROM event_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND OR s.version <> p_version THEN RAISE EXCEPTION 'Schedule changed. Reload and try again.'; END IF;
  IF jsonb_typeof(p_occurrences) <> 'array' OR jsonb_array_length(p_occurrences) NOT BETWEEN 1 AND max_schedule_occurrences THEN
    RAISE EXCEPTION 'Invalid occurrence coverage.';
  END IF;
  UPDATE event_occurrences SET superseded = true, version = version + 1
  WHERE schedule_id = s.id AND end_at > now() AND NOT superseded
    AND original_key NOT IN (SELECT (value->>'original_key')::date FROM jsonb_array_elements(p_occurrences));
  INSERT INTO event_occurrences(schedule_id, original_key, generated_start_at, generated_end_at, start_at, end_at, cancelled)
  SELECT s.id, (value->>'original_key')::date, (value->>'start_at')::timestamptz, (value->>'end_at')::timestamptz,
    (value->>'start_at')::timestamptz, (value->>'end_at')::timestamptz, COALESCE((value->>'cancelled')::boolean, false)
  FROM jsonb_array_elements(p_occurrences)
  ON CONFLICT(schedule_id, original_key) DO UPDATE SET
    generated_start_at = EXCLUDED.generated_start_at, generated_end_at = EXCLUDED.generated_end_at,
    start_at = CASE WHEN event_occurrences.overridden THEN event_occurrences.start_at ELSE EXCLUDED.start_at END,
    end_at = CASE WHEN event_occurrences.overridden THEN event_occurrences.end_at ELSE EXCLUDED.end_at END,
    cancelled = CASE WHEN event_occurrences.overridden THEN event_occurrences.cancelled ELSE EXCLUDED.cancelled END,
    superseded = false, version = event_occurrences.version + 1
  WHERE event_occurrences.end_at > now();
  UPDATE event_schedules SET materialized_version = version WHERE id = s.id;
END;
$$;
REVOKE ALL ON FUNCTION public.materialize_event_schedule(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_event_schedule(uuid, integer, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.social_event_snapshot(p_event_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('event_id', e.id, 'title', e.title, 'description', e.description,
    'poster_url', e.poster_url, 'call_to_action_link', e.call_to_action_link, 'call_to_action_caption', e.call_to_action_caption,
    'publication_status', e.publication_status, 'version', e.version,
    'schedules', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM event_schedules s WHERE s.event_id = e.id), '[]'))
  FROM events e WHERE e.id = p_event_id;
$$;
REVOKE ALL ON FUNCTION public.social_event_snapshot(bigint) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.mutate_event(p_operation text, p_payload jsonb, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_variable
DECLARE e events%ROWTYPE; s event_schedules%ROWTYPE; o event_occurrences%ROWTYPE;
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
  ELSIF p_operation = 'save_schedule' THEN
    IF event_id IS NULL THEN RAISE EXCEPTION 'Event required.'; END IF;
    IF p_payload->>'id' IS NOT NULL THEN
      SELECT * INTO s FROM event_schedules WHERE id=(p_payload->>'id')::uuid AND event_schedules.event_id=e.id FOR UPDATE;
      IF NOT FOUND OR s.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Schedule changed. Reload before saving.'; END IF;
    END IF;
    split_day := (p_payload->>'split_from')::date;
    IF split_day IS NOT NULL AND s.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM event_occurrences WHERE schedule_id=s.id AND original_key<split_day AND NOT superseded) THEN split_day := NULL; END IF;
    IF split_day IS NOT NULL THEN
      IF s.id IS NULL OR s.recurrence IS NULL OR NOT EXISTS(SELECT 1 FROM event_occurrences WHERE schedule_id=s.id AND original_key=split_day AND NOT superseded) THEN
        RAISE EXCEPTION 'Select an existing recurring session to split.';
      END IF;
      UPDATE event_schedules SET recurrence=(recurrence - 'count') || jsonb_build_object('count',NULL,'until',split_day-1),
        version=version+1, materialized_version=version+1 WHERE id=s.id;
    END IF;
    IF s.id IS NULL OR split_day IS NOT NULL THEN
      INSERT INTO event_schedules(event_id,label,start_at,end_at,time_zone,recurrence,poster_url,poster_alt,location)
      VALUES(event_id,COALESCE(f->>'label',''),(f->>'start_at')::timestamptz,(f->>'end_at')::timestamptz,
        COALESCE(f->>'time_zone','America/Toronto'),NULLIF(f->'recurrence','null'),f->>'poster_url',COALESCE(f->>'poster_alt',''),f->>'location') RETURNING id INTO new_schedule;
      IF split_day IS NOT NULL THEN
        -- Retain IDs, overrides and linked reminders for matching original dates.
        UPDATE event_occurrences SET schedule_id=new_schedule WHERE schedule_id=s.id AND original_key>=split_day;
      END IF;
    ELSE
      new_schedule := s.id;
      UPDATE event_schedules SET label=COALESCE(f->>'label',''),start_at=(f->>'start_at')::timestamptz,end_at=(f->>'end_at')::timestamptz,
        recurrence=NULLIF(f->'recurrence','null'),poster_url=f->>'poster_url',poster_alt=COALESCE(f->>'poster_alt',''),location=f->>'location',
        version=version+1 WHERE id=s.id;
    END IF;
    PERFORM materialize_event_schedule(new_schedule,(SELECT version FROM event_schedules WHERE id=new_schedule),p_payload->'occurrences');
    UPDATE events SET version=version+1 WHERE id=event_id;
  ELSIF p_operation = 'occurrence' THEN
    IF COALESCE(p_payload->>'action','') NOT IN ('edit','cancel','restore','reset') THEN RAISE EXCEPTION 'Unknown session action.'; END IF;
    SELECT oc.* INTO o FROM event_occurrences oc JOIN event_schedules sc ON sc.id=oc.schedule_id
      WHERE oc.id=(p_payload->>'id')::uuid AND sc.event_id=event_id FOR UPDATE OF oc;
    IF NOT FOUND OR o.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Session changed. Reload before saving.'; END IF;
    IF o.superseded THEN RAISE EXCEPTION 'This session is no longer in the schedule.'; END IF;
    UPDATE event_occurrences SET
      start_at=CASE WHEN p_payload->>'action'='reset' THEN generated_start_at WHEN p_payload->>'action'='edit' THEN (p_payload->>'start_at')::timestamptz ELSE start_at END,
      end_at=CASE WHEN p_payload->>'action'='reset' THEN generated_end_at WHEN p_payload->>'action'='edit' THEN (p_payload->>'end_at')::timestamptz ELSE end_at END,
      cancelled=CASE
        WHEN p_payload->>'action'='cancel' THEN true
        WHEN p_payload->>'action'='restore' THEN false
        WHEN p_payload->>'action'='reset' THEN EXISTS(SELECT 1 FROM event_schedules sc, jsonb_array_elements_text(COALESCE(sc.recurrence->'exdates','[]')) x WHERE sc.id=o.schedule_id AND x.value=o.original_key::text)
        ELSE cancelled END,
      overridden=(p_payload->>'action'<>'reset'), version=version+1 WHERE id=o.id;
    UPDATE events SET version=version+1 WHERE id=event_id;
  ELSIF p_operation = 'schedule_state' THEN
    UPDATE event_schedules SET cancelled=(p_payload->>'cancelled')::boolean, version=version+1,
      materialized_version=CASE WHEN materialized_version=version THEN version+1 ELSE materialized_version END
    WHERE id=(p_payload->>'id')::uuid AND event_schedules.event_id=event_id AND version=(p_payload->>'version')::integer;
    IF NOT FOUND THEN RAISE EXCEPTION 'Schedule changed. Reload before saving.'; END IF;
    UPDATE events SET version=version+1 WHERE id=event_id;
  ELSIF p_operation = 'status' THEN
    IF e.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RAISE EXCEPTION 'Event changed. Reload before publishing.'; END IF;
    IF p_payload->>'status'='published' AND EXISTS(SELECT 1 FROM event_schedules WHERE event_schedules.event_id=event_id AND materialized_version<>version) THEN
      RAISE EXCEPTION 'Resolve schedule generation before publishing.';
    END IF;
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

-- Publication is directional: drafting an event drafts its campaign; publishing
-- never activates a campaign. Also protect direct SQL and all existing RPCs.
CREATE FUNCTION public.event_publication_campaign_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.publication_status <> 'published' AND NEW.publication_status IS DISTINCT FROM OLD.publication_status THEN
    UPDATE social_campaigns SET status='draft' WHERE event_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER event_publication_campaign_sync AFTER UPDATE OF publication_status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.event_publication_campaign_sync();
CREATE FUNCTION public.guard_campaign_event_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE event_status text;
BEGIN
  IF NEW.event_id IS NOT NULL THEN
    SELECT publication_status INTO event_status FROM events WHERE id=NEW.event_id FOR SHARE;
    IF event_status IS DISTINCT FROM 'published' AND NEW.status='active' THEN
      RAISE EXCEPTION 'Publish the linked event before activating this campaign.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER campaign_event_publication BEFORE INSERT OR UPDATE OF status,event_id ON public.social_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_event_publication();

CREATE OR REPLACE FUNCTION public.require_active_campaign_for_scheduling() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c social_campaigns%ROWTYPE; event_status text;
BEGIN
  IF NEW.status NOT IN ('scheduled','due','processing','sent') THEN RETURN NEW; END IF;
  -- A provider already processing may have published externally; record that fact.
  IF TG_OP='UPDATE' AND ((NEW.status='sent' AND OLD.status IN ('processing','provider_processing')) OR (NEW.status='processing' AND OLD.status='provider_processing')) THEN RETURN NEW; END IF;
  SELECT campaign.* INTO c FROM social_post_variants variant
    JOIN social_posts post ON post.id=variant.post_id JOIN social_campaigns campaign ON campaign.id=post.campaign_id
    WHERE variant.id=NEW.variant_id;
  IF c.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Only active campaigns can schedule or publish posts.'; END IF;
  IF c.event_id IS NOT NULL THEN
    SELECT publication_status INTO event_status FROM events WHERE id=c.event_id;
    IF event_status IS DISTINCT FROM 'published' THEN RAISE EXCEPTION 'Publish the linked event first.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Stable event-session reference is separate from the social reminder record.
ALTER TABLE public.social_campaign_occurrences ADD COLUMN event_occurrence_id uuid REFERENCES public.event_occurrences(id) ON DELETE SET NULL;
CREATE INDEX social_campaign_event_occurrence_idx ON public.social_campaign_occurrences(event_occurrence_id);
COMMIT;
