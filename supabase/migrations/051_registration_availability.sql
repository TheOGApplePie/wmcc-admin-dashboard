-- Event-level form availability; submission enforcement remains with the external writer.
BEGIN;
CREATE TABLE public.registration_availability (
 event_id bigint PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
 closed boolean NOT NULL DEFAULT false,
 reopen_at timestamptz,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 CHECK (closed OR reopen_at IS NULL)
);
ALTER TABLE public.registration_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_availability FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.registration_availability TO authenticated;
CREATE POLICY registration_availability_staff_read ON public.registration_availability FOR SELECT TO authenticated
 USING (public.has_perm('events','view'));

-- A newly configured or replaced form starts open, while preserving monotonic revisions.
CREATE FUNCTION public.open_registration_for_new_form() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.cognito_form_id IS NOT NULL AND NEW.cognito_form_id IS DISTINCT FROM OLD.cognito_form_id THEN
   INSERT INTO public.registration_availability(event_id,closed,reopen_at,revision)
     VALUES(NEW.id,false,NULL,1)
   ON CONFLICT(event_id) DO UPDATE SET closed=false,reopen_at=NULL,revision=public.registration_availability.revision+1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.open_registration_for_new_form() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER open_registration_for_new_form AFTER UPDATE OF cognito_form_id ON public.events
 FOR EACH ROW EXECUTE FUNCTION public.open_registration_for_new_form();

CREATE FUNCTION public.public_registration_open(p_event_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((SELECT e.publication_status='published' AND e.cognito_form_id IS NOT NULL
   AND (NOT COALESCE(a.closed,false) OR (a.reopen_at IS NOT NULL AND a.reopen_at<=now()))
   FROM public.events e LEFT JOIN public.registration_availability a ON a.event_id=e.id
   WHERE e.id=p_event_id),false)
$$;
REVOKE ALL ON FUNCTION public.public_registration_open(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_registration_open(bigint) TO anon,authenticated;

CREATE FUNCTION public.registration_availability_status(p_event_id bigint)
RETURNS TABLE(configured boolean,closed boolean,reopen_at timestamptz,revision integer,effective_open boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.has_perm('events','view') THEN RAISE EXCEPTION 'Permission denied: events.view' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT e.cognito_form_id IS NOT NULL, COALESCE(a.closed,false), a.reopen_at, COALESCE(a.revision,0),
   e.cognito_form_id IS NOT NULL AND (NOT COALESCE(a.closed,false) OR (a.reopen_at IS NOT NULL AND a.reopen_at<=now()))
 FROM public.events e LEFT JOIN public.registration_availability a ON a.event_id=e.id WHERE e.id=p_event_id;
END $$;
REVOKE ALL ON FUNCTION public.registration_availability_status(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registration_availability_status(bigint) TO authenticated;

CREATE FUNCTION public.set_registration_availability(p_event_id bigint,p_revision integer,p_action text,p_reopen_at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision integer; configured text;
BEGIN
 IF NOT public.has_perm('events','edit') THEN RAISE EXCEPTION 'Permission denied: events.edit' USING ERRCODE='42501'; END IF;
 IF p_event_id IS NULL OR p_event_id<=0 OR p_revision IS NULL OR p_revision<0 OR p_action IS NULL OR p_action NOT IN ('open','close','schedule')
   OR (p_action='schedule' AND (p_reopen_at IS NULL OR p_reopen_at<=now()))
   OR (p_action<>'schedule' AND p_reopen_at IS NOT NULL) THEN RAISE EXCEPTION 'Invalid registration availability.' USING ERRCODE='22023'; END IF;
 SELECT cognito_form_id INTO configured FROM public.events WHERE id=p_event_id FOR SHARE;
 IF configured IS NULL THEN RAISE EXCEPTION 'Configure a Cognito form first.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.registration_availability(event_id) VALUES(p_event_id) ON CONFLICT(event_id) DO NOTHING;
 SELECT revision INTO current_revision FROM public.registration_availability WHERE event_id=p_event_id FOR UPDATE;
 IF current_revision<>p_revision THEN RAISE EXCEPTION 'Registration settings changed. Reload before saving.' USING ERRCODE='40001'; END IF;
 UPDATE public.registration_availability SET closed=(p_action<>'open'),reopen_at=CASE WHEN p_action='schedule' THEN p_reopen_at ELSE NULL END,
   revision=revision+1 WHERE event_id=p_event_id RETURNING revision INTO current_revision;
 INSERT INTO public.audit_logs(user_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'event_registration',p_event_id::text,'availability_'||p_action,
   CASE WHEN p_action='schedule' THEN p_reopen_at::text ELSE NULL END);
 RETURN current_revision;
END $$;
REVOKE ALL ON FUNCTION public.set_registration_availability(bigint,integer,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_registration_availability(bigint,integer,text,timestamptz) TO authenticated;
COMMIT;
