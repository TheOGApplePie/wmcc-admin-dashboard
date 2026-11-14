BEGIN;

-- One JSON array per parent event; recurring sessions share this collection.
CREATE TABLE public.event_registrations (
  event_id bigint PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  form_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT event_registrations_array CHECK (jsonb_typeof(form_data) = 'array'),
  -- Match the backend reader: rows must be registration objects, not scalars/arrays.
  CONSTRAINT event_registrations_objects CHECK (
    CASE WHEN jsonb_typeof(form_data) = 'array' THEN
      NOT jsonb_path_exists(form_data, 'strict $[*] ? (@.type() != "object")')
    ELSE false END
  )
);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_registrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_registrations TO authenticated;
GRANT ALL ON public.event_registrations TO service_role;

CREATE POLICY event_registrations_staff_read
  ON public.event_registrations FOR SELECT TO authenticated
  USING (public.has_perm('events', 'view'));

COMMIT;
