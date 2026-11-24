-- Convert legacy registration documents and install the paginated table reader.
BEGIN;
-- Stop concurrent writers before copying and replacing the legacy rows.
LOCK TABLE public.event_registrations IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE registration_entries_to_migrate ON COMMIT DROP AS
SELECT r.event_id, entry.value AS form_data, entry.ordinality
FROM public.event_registrations r
CROSS JOIN LATERAL jsonb_array_elements(r.form_data) WITH ORDINALITY AS entry(value, ordinality);

DELETE FROM public.event_registrations;
ALTER TABLE public.event_registrations
  DROP CONSTRAINT event_registrations_pkey,
  DROP CONSTRAINT event_registrations_array,
  DROP CONSTRAINT event_registrations_objects,
  ALTER COLUMN form_data DROP DEFAULT,
  ADD COLUMN id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ADD CONSTRAINT event_registrations_object CHECK (jsonb_typeof(form_data) = 'object');
CREATE INDEX event_registrations_event_id_id_idx ON public.event_registrations(event_id, id);
INSERT INTO public.event_registrations(event_id, form_data)
SELECT event_id, form_data FROM registration_entries_to_migrate ORDER BY event_id, ordinality;

CREATE OR REPLACE FUNCTION public.event_registration_page(
  p_event_id bigint, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25
) RETURNS TABLE(total bigint, registrations jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NOT public.has_perm('events','view') THEN RAISE EXCEPTION 'Permission denied: events.view' USING ERRCODE='42501'; END IF;
  IF p_event_id IS NULL OR p_event_id<=0 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid registration page.' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT
    (SELECT count(*) FROM public.event_registrations r WHERE r.event_id=p_event_id),
    COALESCE((SELECT jsonb_agg(page.form_data ORDER BY page.id) FROM (
      SELECT r.id, r.form_data FROM public.event_registrations r WHERE r.event_id=p_event_id
      ORDER BY r.id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
    ) page), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.event_registration_table(
  p_event_id bigint, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25,
  p_column_page integer DEFAULT 1, p_column_page_size integer DEFAULT 10,
  p_snapshot text DEFAULT NULL
) RETURNS TABLE(total bigint, registrations jsonb, column_total bigint, columns jsonb, snapshot text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE current_snapshot text;
BEGIN
  IF NOT public.has_perm('events','view') THEN RAISE EXCEPTION 'Permission denied: events.view' USING ERRCODE='42501'; END IF;
  IF p_event_id IS NULL OR p_event_id <= 0 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR p_column_page IS NULL OR p_column_page NOT BETWEEN 1 AND 1000000
    OR p_column_page_size IS NULL OR p_column_page_size NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid registration table page.' USING ERRCODE='22023';
  END IF;
  SELECT md5(COALESCE(string_agg(r.id::text || ':' || md5(r.form_data::text), ',' ORDER BY r.id), ''))
    INTO current_snapshot FROM public.event_registrations r WHERE r.event_id=p_event_id;
  IF p_snapshot IS NOT NULL AND p_snapshot <> current_snapshot THEN
    RAISE EXCEPTION 'Registrations changed. Refresh the table to continue.' USING ERRCODE='40001';
  END IF;
  RETURN QUERY WITH labels AS MATERIALIZED (
    SELECT DISTINCT key COLLATE "C" AS label FROM public.event_registrations r
    CROSS JOIN LATERAL jsonb_object_keys(r.form_data) AS fields(key) WHERE r.event_id=p_event_id
  ), page_rows AS (
    SELECT r.id, r.form_data FROM public.event_registrations r WHERE r.event_id=p_event_id
    ORDER BY r.id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
  ), page_columns AS (
    SELECT label FROM labels ORDER BY label LIMIT p_column_page_size OFFSET (p_column_page::bigint-1)*p_column_page_size
  ) SELECT (SELECT count(*) FROM public.event_registrations r WHERE r.event_id=p_event_id),
    COALESCE((SELECT jsonb_agg(form_data ORDER BY id) FROM page_rows),'[]'::jsonb),
    (SELECT count(*) FROM labels),
    COALESCE((SELECT jsonb_agg(label ORDER BY label) FROM page_columns),'[]'::jsonb), current_snapshot;
END $$;
REVOKE ALL ON FUNCTION public.event_registration_table(bigint,integer,integer,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_registration_table(bigint,integer,integer,integer,integer,text) TO authenticated;

-- Browser entries are unverified input; only a server holding the service role may call this.
CREATE FUNCTION public.append_browser_event_registration(p_event_id bigint, p_form_id text, p_entry jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_event_id IS NULL OR p_form_id IS NULL OR jsonb_typeof(p_entry) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  -- Keep the association stable until the entry has been inserted.
  PERFORM 1 FROM public.events
    WHERE id = p_event_id AND cognito_form_id = p_form_id AND publication_status = 'published'
    FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.event_registrations(event_id, form_data) VALUES (p_event_id, p_entry);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.append_browser_event_registration(bigint,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_browser_event_registration(bigint,text,jsonb) TO service_role;
COMMIT;
