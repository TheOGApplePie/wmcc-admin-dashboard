BEGIN;
CREATE OR REPLACE FUNCTION public.reorder_announcements(p_ids bigint[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE changed integer;
BEGIN
  IF NOT public.has_perm('announcements', 'edit') THEN
    RAISE EXCEPTION 'Permission denied: announcements.edit';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR
     cardinality(p_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_ids) AS ids(id)) THEN
    RAISE EXCEPTION 'Provide distinct announcement IDs.';
  END IF;
  -- Serialize reorder requests; one failed update rolls back the whole call.
  PERFORM pg_advisory_xact_lock(270026);
  UPDATE public.announcements AS a SET display_order = ordered.position::integer
  FROM unnest(p_ids) WITH ORDINALITY AS ordered(id, position)
  WHERE a.id = ordered.id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> cardinality(p_ids) THEN
    RAISE EXCEPTION 'An announcement is missing or cannot be updated. Refresh and try again.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_announcements(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_announcements(bigint[]) TO authenticated;
COMMIT;
