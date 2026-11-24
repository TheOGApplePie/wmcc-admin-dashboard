-- Page submissions inside the existing event JSON document before sending data to Next.js.
BEGIN;
CREATE FUNCTION public.event_registration_page(
  p_event_id bigint, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25
) RETURNS TABLE(total bigint, registrations jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NOT has_perm('events','view') THEN RAISE EXCEPTION 'Permission denied: events.view' USING ERRCODE='42501'; END IF;
  IF p_event_id IS NULL OR p_event_id<=0 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid registration page.' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    SELECT COALESCE(jsonb_array_length(r.form_data),0)::bigint,
      COALESCE((
        SELECT jsonb_agg(item.value ORDER BY item.ordinality)
        FROM (
          SELECT entry.value,entry.ordinality
          FROM jsonb_array_elements(r.form_data) WITH ORDINALITY AS entry(value,ordinality)
          ORDER BY entry.ordinality
          LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
        ) item
      ),'[]'::jsonb)
    FROM (VALUES(p_event_id)) AS requested(event_id)
    LEFT JOIN public.event_registrations r ON r.event_id=requested.event_id;
END $$;
REVOKE ALL ON FUNCTION public.event_registration_page(bigint,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.event_registration_page(bigint,integer,integer) TO authenticated;
COMMIT;
