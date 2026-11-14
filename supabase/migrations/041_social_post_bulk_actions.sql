BEGIN;

CREATE FUNCTION public.bulk_social_post_action(p_posts jsonb,p_action text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item record; post social_posts%ROWTYPE; changed integer:=0;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('approve','draft','delete') THEN RAISE EXCEPTION 'Invalid bulk action.'; END IF;
  IF NOT has_perm('social',CASE WHEN p_action='delete' THEN 'delete' ELSE 'edit' END) THEN
    RAISE EXCEPTION 'Permission denied for this bulk action.';
  END IF;
  IF p_action='approve' AND NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
  IF p_posts IS NULL OR jsonb_typeof(p_posts)<>'array' OR jsonb_array_length(p_posts) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 posts.';
  END IF;
  -- Validate required optimistic-lock fields before acquiring campaign/post locks.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_posts) AS x(value)
    WHERE jsonb_typeof(value) IS DISTINCT FROM 'object'
      OR jsonb_typeof(value->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(value->'version') IS DISTINCT FROM 'number'
  ) THEN RAISE EXCEPTION 'Each post requires an ID and a positive integer version.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_posts) AS x(id uuid,version integer)
    WHERE id IS NULL OR version IS NULL OR version < 1
  ) THEN RAISE EXCEPTION 'Each post requires an ID and a positive integer version.'; END IF;
  IF (SELECT count(DISTINCT id) FROM jsonb_to_recordset(p_posts) AS x(id uuid,version integer))<>jsonb_array_length(p_posts) THEN
    RAISE EXCEPTION 'Select each post only once.';
  END IF;
  PERFORM c.id FROM social_campaigns c WHERE c.id IN (
    SELECT p.campaign_id FROM social_posts p JOIN jsonb_to_recordset(p_posts) AS x(id uuid,version integer) ON p.id=x.id
  ) ORDER BY c.id FOR UPDATE;
  -- Bounded to 100: reuse canonical mutations rather than duplicate their rules.
  -- Any failure rolls back the entire function, including earlier items.
  FOR item IN SELECT * FROM jsonb_to_recordset(p_posts) AS x(id uuid,version integer) ORDER BY id LOOP
    SELECT * INTO post FROM social_posts WHERE id=item.id FOR UPDATE;
    IF post.id IS NULL OR post.version IS DISTINCT FROM item.version THEN
      RAISE EXCEPTION 'A selected post changed. Reload before trying again.';
    END IF;
    BEGIN
      IF p_action='delete' THEN
        PERFORM delete_social_post(post.id);
      ELSE
        IF p_action='approve' AND post.status NOT IN ('draft','proposed') THEN
          RAISE EXCEPTION 'Only drafts and proposed posts can be approved.';
        END IF;
        PERFORM save_social_post(post.id,post.version,post.campaign_id,post.title,post.caption,
          post.media_urls,post.media_alt_texts,post.hashtags,post.channel,
          CASE WHEN p_action='approve' THEN 'scheduled' ELSE 'draft' END,post.scheduled_date,post.time_slot);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Post "%": %',post.title,SQLERRM;
    END;
    changed:=changed+1;
  END LOOP;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.bulk_social_post_action(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bulk_social_post_action(jsonb,text) TO authenticated;

COMMIT;
