-- Copy selected content fields atomically without changing publication or scheduling state.
CREATE FUNCTION copy_social_post_details(
  p_source_id uuid, p_campaign_id uuid, p_targets jsonb, p_details jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c social_campaigns%ROWTYPE;
  p social_posts%ROWTYPE;
  target jsonb;
  item jsonb;
BEGIN
  IF NOT has_perm('social','edit') THEN RAISE EXCEPTION 'Permission denied: social.edit'; END IF;
  IF jsonb_typeof(p_targets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_targets) NOT BETWEEN 1 AND 500
    OR jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR p_details='{}'::jsonb THEN
    RAISE EXCEPTION 'Select fields and target posts.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_details) k WHERE k NOT IN
    ('description','caption','media_items','hashtags','call_to_action_link','call_to_action_caption'))
    OR EXISTS(SELECT 1 FROM jsonb_each(p_details) e WHERE e.value='null'::jsonb) THEN
    RAISE EXCEPTION 'Invalid content fields.';
  END IF;
  IF (SELECT count(DISTINCT t->>'id') FROM jsonb_array_elements(p_targets) t)<>jsonb_array_length(p_targets) THEN
    RAISE EXCEPTION 'Duplicate target posts.';
  END IF;
  SELECT * INTO c FROM social_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF c.id IS NULL OR c.status IN ('archived','completed') THEN RAISE EXCEPTION 'Select an editable campaign.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM social_posts WHERE id=p_source_id AND campaign_id=c.id) THEN
    RAISE EXCEPTION 'Source post is not in this campaign.';
  END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) ORDER BY value->>'id' LOOP
    SELECT * INTO p FROM social_posts WHERE id=(target->>'id')::uuid AND campaign_id=c.id FOR UPDATE;
    IF p.id IS NULL OR p.id=p_source_id OR p.version IS DISTINCT FROM (target->>'version')::integer THEN
      RAISE EXCEPTION 'A selected post changed. Reload and select the posts again.';
    END IF;
    IF p.status NOT IN ('draft','proposed','scheduled') THEN RAISE EXCEPTION 'A selected post can no longer be edited.'; END IF;
    IF p.status='scheduled' AND NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
    IF p_details ? 'description' THEN p.description:=p_details->>'description'; END IF;
    IF p_details ? 'caption' THEN p.caption:=p_details->>'caption'; END IF;
    IF p_details ? 'call_to_action_link' THEN p.call_to_action_link:=NULLIF(p_details->>'call_to_action_link',''); END IF;
    IF p_details ? 'call_to_action_caption' THEN p.call_to_action_caption:=NULLIF(p_details->>'call_to_action_caption',''); END IF;
    IF p_details ? 'hashtags' THEN
      SELECT COALESCE(array_agg(value),'{}') INTO p.hashtags FROM jsonb_array_elements_text(p_details->'hashtags');
    END IF;
    IF p_details ? 'media_items' THEN
      p.media_urls:='{}'; p.media_alt_texts:='{}';
      FOR item IN SELECT value FROM jsonb_array_elements(p_details->'media_items') LOOP
        IF item->>'url' IS NULL OR item->>'alt_text' IS NULL THEN RAISE EXCEPTION 'Invalid media item.'; END IF;
        p.media_urls:=array_append(p.media_urls,item->>'url');
        p.media_alt_texts:=array_append(p.media_alt_texts,item->>'alt_text');
      END LOOP;
    END IF;
    IF length(p.description)>2000 OR length(p.caption)>2200 OR length(p.call_to_action_caption)>100
      OR cardinality(p.hashtags)>30 OR EXISTS(SELECT 1 FROM unnest(p.hashtags) h WHERE length(h) NOT BETWEEN 1 AND 100)
      OR EXISTS(SELECT 1 FROM unnest(p.media_urls) u WHERE u !~ '^https://')
      OR (p.call_to_action_link IS NOT NULL AND p.call_to_action_link !~ '^https://')
      OR EXISTS(SELECT 1 FROM unnest(p.media_alt_texts) a WHERE length(a)>1000) THEN
      RAISE EXCEPTION 'Invalid post details.';
    END IF;
    IF p.status='scheduled' THEN
      IF p.scheduled_at IS NULL OR p.scheduled_at<=now() THEN RAISE EXCEPTION 'A selected post is already due.'; END IF;
      IF btrim(p.caption)='' OR (p.channel<>'whatsapp' AND cardinality(p.media_urls)=0) THEN
        RAISE EXCEPTION 'Scheduled posts require a caption and platform media.';
      END IF;
      IF p.channel IN ('instagram_feed','instagram_story') AND EXISTS(SELECT 1 FROM unnest(p.media_alt_texts) a WHERE btrim(a)='') THEN
        RAISE EXCEPTION 'Scheduled Instagram images require alt text.';
      END IF;
    END IF;
    UPDATE social_posts SET description=p.description,caption=p.caption,media_urls=p.media_urls,
      media_alt_texts=p.media_alt_texts,hashtags=p.hashtags,call_to_action_link=p.call_to_action_link,
      call_to_action_caption=p.call_to_action_caption WHERE id=p.id;
    INSERT INTO audit_logs(user_id,entity_type,entity_id,action,detail)
      VALUES(auth.uid(),'social_post',p.id::text,'copy_details',
        'source:'||p_source_id::text||'; fields:'||(SELECT string_agg(k,',') FROM jsonb_object_keys(p_details) k));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION copy_social_post_details(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION copy_social_post_details(uuid,uuid,jsonb,jsonb) TO authenticated;
