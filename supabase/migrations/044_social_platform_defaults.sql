-- One small JSON value per campaign; no backfill changes existing post content.
BEGIN;
CREATE FUNCTION valid_social_platform_defaults(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE platform text; content jsonb;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  FOR platform,content IN SELECT * FROM jsonb_each(value) LOOP
    IF platform NOT IN ('instagram','whatsapp','tiktok') OR jsonb_typeof(content) IS DISTINCT FROM 'object'
      OR NOT (content ?& ARRAY['message','poster']) OR (content - 'message' - 'poster')<>'{}'::jsonb
      OR jsonb_typeof(content->'message') IS DISTINCT FROM 'string' OR length(content->>'message')>2200 THEN RETURN false; END IF;
    IF content->'poster'<>'null'::jsonb AND (
      jsonb_typeof(content->'poster') IS DISTINCT FROM 'object'
      OR NOT ((content->'poster') ?& ARRAY['url','alt_text'])
      OR ((content->'poster') - 'url' - 'alt_text')<>'{}'::jsonb
      OR jsonb_typeof(content->'poster'->'url') IS DISTINCT FROM 'string'
      OR (content->'poster'->>'url') !~ '^https://[^/]+'
      OR jsonb_typeof(content->'poster'->'alt_text') IS DISTINCT FROM 'string'
      OR length(content->'poster'->>'alt_text')>1000) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
ALTER TABLE social_campaigns ADD COLUMN platform_defaults jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (valid_social_platform_defaults(platform_defaults));

-- Retain canonical save/approval validation and reject unresolved provider retries.
CREATE OR REPLACE FUNCTION save_social_post(
 p_id uuid,p_version integer,p_campaign_id uuid,p_title text,p_caption text,
 p_media_urls text[],p_media_alt_texts text[],p_hashtags text[],
 p_channel social_post_channel,p_mode text,p_scheduled_date date,p_time_slot time_slot
) RETURNS social_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c social_campaigns%ROWTYPE; old_post social_posts%ROWTYPE; result social_posts%ROWTYPE; due_at timestamptz;
BEGIN
 IF NOT has_perm('social','edit') THEN RAISE EXCEPTION 'Permission denied: social.edit'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('draft','scheduled') THEN RAISE EXCEPTION 'Invalid post mode.'; END IF;
 SELECT * INTO c FROM social_campaigns WHERE id=p_campaign_id FOR UPDATE;
 IF c.id IS NULL OR c.status IN ('archived','completed') THEN RAISE EXCEPTION 'Select an editable campaign.'; END IF;
 IF p_id IS NOT NULL THEN
   SELECT * INTO old_post FROM social_posts WHERE id=p_id AND campaign_id=c.id FOR UPDATE;
   IF old_post.id IS NULL OR old_post.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'Post changed. Reload before saving.'; END IF;
   IF old_post.provider_processing_started_at IS NOT NULL OR (old_post.status='failed' AND (old_post.retryable OR old_post.next_attempt_at IS NOT NULL OR old_post.external_id IS NOT NULL)) THEN RAISE EXCEPTION 'A retry or provider reconciliation is pending. This post cannot be edited.'; END IF;
   IF old_post.status IN ('due','processing','provider_processing','sent','skipped','cancelled') THEN RAISE EXCEPTION 'This post can no longer be edited.'; END IF;
 END IF;
 IF length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'A title is required (up to 120 characters).'; END IF;
 IF p_media_urls IS NULL OR p_media_alt_texts IS NULL OR cardinality(p_media_urls)<>cardinality(p_media_alt_texts)
   OR EXISTS(SELECT 1 FROM unnest(p_media_urls) u WHERE u IS NULL OR u !~ '^https://') THEN RAISE EXCEPTION 'Invalid media selection.'; END IF;
 -- Retained compatibility columns are not published; new saves must not accumulate hidden values.
 IF p_channel IN ('instagram_story','whatsapp') THEN p_hashtags:='{}'; END IF;
 IF p_channel='instagram_story' THEN p_caption:=''; END IF;
 IF p_channel<>'instagram_feed' THEN
   p_media_alt_texts:=ARRAY(SELECT ''::text FROM unnest(p_media_urls));
 END IF;
 IF p_channel='whatsapp' AND EXISTS(SELECT 1 FROM unnest(p_media_urls) u
   WHERE u !~ '^https://[^/]+/storage/v1/object/public/event-posters/public/.+\.[jJ][pP][eE]?[gG]$') THEN
   RAISE EXCEPTION 'WhatsApp supports JPEG posters from event-posters/public only; videos are unsupported.';
 END IF;
 IF p_channel IN ('instagram_feed','instagram_reel') AND length(concat_ws(E'\n\n',NULLIF(btrim(p_caption),''),NULLIF((SELECT string_agg('#'||regexp_replace(t,'^#',''),' ') FROM unnest(p_hashtags) t),'')))>2200 THEN
   RAISE EXCEPTION 'Caption and hashtags together must be 2,200 characters or fewer.';
 END IF;
 IF p_mode='scheduled' THEN
   IF NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
   IF c.status<>'active' OR c.needs_review THEN RAISE EXCEPTION 'Activate and review the campaign before publishing.'; END IF;
   IF c.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM events WHERE id=c.event_id AND publication_status='published') THEN RAISE EXCEPTION 'Publish the linked event first.'; END IF;
   due_at:=social_slot_scheduled_at(p_scheduled_date,p_time_slot);
   IF due_at IS NULL OR due_at<=now() THEN RAISE EXCEPTION 'Choose a future date and time slot.'; END IF;
   IF (c.starts_on IS NOT NULL AND p_scheduled_date<c.starts_on) OR (c.ends_on IS NOT NULL AND p_scheduled_date>c.ends_on) THEN RAISE EXCEPTION 'The scheduled date is outside the campaign dates.'; END IF;
   IF (p_channel<>'instagram_story' AND btrim(COALESCE(p_caption,''))='') OR (p_channel<>'whatsapp' AND cardinality(p_media_urls)=0) THEN RAISE EXCEPTION 'Caption and platform media are required.'; END IF;
   IF p_channel='instagram_feed' AND EXISTS(SELECT 1 FROM unnest(p_media_alt_texts) a WHERE btrim(COALESCE(a,''))='') THEN RAISE EXCEPTION 'Alt text is required for every Instagram image.'; END IF;
   IF c.event_id IS NULL THEN
     IF EXISTS(SELECT 1 FROM social_posts WHERE campaign_id=c.id AND id IS DISTINCT FROM p_id AND scheduled_date<>p_scheduled_date
       AND abs(scheduled_date-p_scheduled_date)<3 AND (status IN ('proposed','scheduled','due','processing','provider_processing','sent') OR (status='failed' AND retryable))) THEN
       RAISE EXCEPTION 'Standalone campaign posts must be at least three calendar days apart.';
     END IF;
     IF (SELECT count(DISTINCT scheduled_date) FROM social_posts WHERE campaign_id=c.id AND id IS DISTINCT FROM p_id AND scheduled_date<>p_scheduled_date
       AND date_trunc('week',scheduled_date::timestamp)=date_trunc('week',p_scheduled_date::timestamp)
       AND (status IN ('proposed','scheduled','due','processing','provider_processing','sent') OR (status='failed' AND retryable)))>=2 THEN
       RAISE EXCEPTION 'Standalone campaigns may use at most two posting dates per week.';
     END IF;
   END IF;
 END IF;
 INSERT INTO social_posts(id,campaign_id,title,caption,media_urls,media_alt_texts,hashtags,
   channel,schedule_platform,scheduled_date,time_slot,scheduled_at,status,created_by,assigned_to,publication_consented_at,publication_consented_by,next_attempt_at)
 VALUES(COALESCE(p_id,gen_random_uuid()),c.id,p_title,COALESCE(p_caption,''),p_media_urls,p_media_alt_texts,COALESCE(p_hashtags,'{}'),
   p_channel,CASE WHEN p_channel::text LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform WHEN p_channel='whatsapp' THEN 'whatsapp'::social_schedule_platform ELSE 'tiktok'::social_schedule_platform END,
   p_scheduled_date,p_time_slot,due_at,p_mode::social_post_status,auth.uid(),c.default_assigned_to,
   CASE WHEN p_mode='scheduled' THEN now() END,CASE WHEN p_mode='scheduled' THEN auth.uid() END,due_at)
 ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,caption=EXCLUDED.caption,media_urls=EXCLUDED.media_urls,media_alt_texts=EXCLUDED.media_alt_texts,
   hashtags=EXCLUDED.hashtags,channel=EXCLUDED.channel,schedule_platform=EXCLUDED.schedule_platform,
   scheduled_date=EXCLUDED.scheduled_date,time_slot=EXCLUDED.time_slot,scheduled_at=EXCLUDED.scheduled_at,status=EXCLUDED.status,
   publication_consented_at=EXCLUDED.publication_consented_at,publication_consented_by=EXCLUDED.publication_consented_by,next_attempt_at=EXCLUDED.next_attempt_at,
   attempt_count=0,retryable=true,provider_error=NULL,external_id=NULL,provider_processing_started_at=NULL,
   needs_review=CASE WHEN p_mode='scheduled' THEN false ELSE social_posts.needs_review END,
   review_reason=CASE WHEN p_mode='scheduled' THEN NULL ELSE social_posts.review_reason END,version=social_posts.version+1,updated_at=now()
 RETURNING * INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION save_social_post(uuid,integer,uuid,text,text,text[],text[],text[],social_post_channel,text,date,time_slot) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_social_post(uuid,integer,uuid,text,text,text[],text[],text[],social_post_channel,text,date,time_slot) TO authenticated;

CREATE OR REPLACE FUNCTION copy_social_post_details(
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
    ('caption','media_items','hashtags'))
    OR EXISTS(SELECT 1 FROM jsonb_each(p_details) e WHERE e.value='null'::jsonb) THEN
    RAISE EXCEPTION 'Invalid content fields.';
  END IF;
  IF (SELECT count(DISTINCT t->>'id') FROM jsonb_array_elements(p_targets) t)<>jsonb_array_length(p_targets) THEN
    RAISE EXCEPTION 'Duplicate target posts.';
  END IF;
  SELECT * INTO c FROM social_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF c.id IS NULL OR c.status IN ('archived','completed') THEN RAISE EXCEPTION 'Select an editable campaign.'; END IF;
  IF p_source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_posts WHERE id=p_source_id AND campaign_id=c.id) THEN
    RAISE EXCEPTION 'Source post is not in this campaign.';
  END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) ORDER BY value->>'id' LOOP
    SELECT * INTO p FROM social_posts WHERE id=(target->>'id')::uuid AND campaign_id=c.id FOR UPDATE;
    IF p.id IS NULL OR p.id=p_source_id OR p.version IS DISTINCT FROM (target->>'version')::integer THEN
      RAISE EXCEPTION 'A selected post changed. Reload and select the posts again.';
    END IF;
    IF p.provider_processing_started_at IS NOT NULL OR (p.status='failed' AND (p.retryable OR p.next_attempt_at IS NOT NULL OR p.external_id IS NOT NULL)) OR p.status NOT IN ('draft','proposed','scheduled','failed') THEN RAISE EXCEPTION 'A selected post can no longer be edited.'; END IF;
    IF p.status='scheduled' AND NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
    IF p_details ? 'caption' THEN p.caption:=p_details->>'caption'; END IF;
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
    IF p_details ? 'caption' AND p.channel='instagram_story' THEN p.caption:=''; END IF;
    IF p_details ? 'hashtags' AND p.channel IN ('instagram_story','whatsapp') THEN p.hashtags:='{}'; END IF;
    IF p_details ? 'media_items' AND p.channel<>'instagram_feed' THEN p.media_alt_texts:=ARRAY(SELECT ''::text FROM unnest(p.media_urls)); END IF;
    IF (p.channel<>'instagram_feed' AND cardinality(p.media_urls)>1) OR cardinality(p.media_urls)>10
      OR (p.channel='whatsapp' AND EXISTS(SELECT 1 FROM unnest(p.media_urls) u WHERE u !~ '^https://[^/]+/storage/v1/object/public/event-posters/public/.+\.[jJ][pP][eE]?[gG]$')) THEN
      RAISE EXCEPTION 'Media does not fit the selected platform.';
    END IF;
    IF length(p.caption)>2200
      OR cardinality(p.hashtags)>30 OR EXISTS(SELECT 1 FROM unnest(p.hashtags) h WHERE length(h) NOT BETWEEN 1 AND 100)
      OR EXISTS(SELECT 1 FROM unnest(p.media_urls) u WHERE u !~ '^https://')
      OR EXISTS(SELECT 1 FROM unnest(p.media_alt_texts) a WHERE length(a)>1000) THEN
      RAISE EXCEPTION 'Invalid post details.';
    END IF;
    IF p.status='scheduled' AND (p.scheduled_at IS NULL OR p.scheduled_at<=now()) THEN RAISE EXCEPTION 'A selected post is already due.'; END IF;
    UPDATE social_posts SET caption=p.caption,media_urls=p.media_urls,
      media_alt_texts=p.media_alt_texts,hashtags=p.hashtags,
      status='draft',scheduled_at=NULL,next_attempt_at=NULL,
      publication_consented_at=NULL,publication_consented_by=NULL,publisher_user_id=NULL
      WHERE id=p.id;
    INSERT INTO audit_logs(user_id,entity_type,entity_id,action,detail)
      VALUES(auth.uid(),'social_post',p.id::text,'copy_details',
        'source:'||COALESCE(p_source_id::text,'campaign-defaults')||'; fields:'||(SELECT string_agg(k,',') FROM jsonb_object_keys(p_details) k));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION copy_social_post_details(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION copy_social_post_details(uuid,uuid,jsonb,jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION persist_schedule_campaign_proposals(
 p_campaign_id uuid,p_campaign_version integer,p_event_version integer,p_proposals jsonb,p_suppressed jsonb,
 p_generated_through date,p_launch_schedule_id uuid,p_launch_at timestamptz,p_launch_decision_made boolean
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c social_campaigns%ROWTYPE; e events%ROWTYPE; proposal jsonb; ch text; added integer; inserted integer:=0; content jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
 SELECT * INTO e FROM events WHERE id=(SELECT event_id FROM social_campaigns WHERE id=p_campaign_id) FOR SHARE;
 SELECT * INTO c FROM social_campaigns WHERE id=p_campaign_id FOR UPDATE;
 IF c.id IS NULL OR e.id IS NULL OR c.event_id IS DISTINCT FROM e.id OR c.status<>'active' OR NOT c.generation_enabled OR c.needs_review
   OR c.version IS DISTINCT FROM p_campaign_version OR e.version IS DISTINCT FROM p_event_version OR e.publication_status<>'published' THEN
   RAISE EXCEPTION 'Campaign or event changed. Reload before generating.';
 END IF;
 IF c.generated_through>=p_generated_through THEN RETURN 0; END IF;
 IF p_launch_schedule_id IS NOT NULL AND (p_launch_at IS NULL OR NOT EXISTS(SELECT 1 FROM event_schedules WHERE id=p_launch_schedule_id AND event_id=e.id)) THEN RAISE EXCEPTION 'Invalid launch schedule.'; END IF;
 FOR proposal IN SELECT value FROM jsonb_array_elements(p_proposals) LOOP
   IF NOT EXISTS(SELECT 1 FROM event_schedules WHERE id=(proposal->>'eventScheduleId')::uuid AND event_id=e.id)
     OR proposal->>'sourceDate' IS NULL OR proposal->>'milestone' IS NULL THEN RAISE EXCEPTION 'Invalid source schedule.'; END IF;
   FOR ch IN SELECT jsonb_array_elements_text(proposal->'channels') LOOP
     IF proposal->'suggestions'->ch->>'date' IS NULL OR proposal->'suggestions'->ch->>'slot' IS NULL
       OR (c.starts_on IS NOT NULL AND (proposal->'suggestions'->ch->>'date')::date<c.starts_on)
       OR (c.ends_on IS NOT NULL AND (proposal->'suggestions'->ch->>'date')::date>c.ends_on) THEN RAISE EXCEPTION 'Invalid proposal date or slot.'; END IF;
     content:=c.platform_defaults->CASE WHEN ch LIKE 'instagram_%' THEN 'instagram' WHEN ch='whatsapp' THEN 'whatsapp' ELSE 'tiktok' END;
     INSERT INTO social_posts(campaign_id,channel,title,caption,media_urls,media_alt_texts,
       source_schedule_id,source_date,reminder_milestone,scheduled_date,time_slot,schedule_platform,status,created_by,assigned_to)
     VALUES(c.id,ch::social_post_channel,proposal->>'title',CASE WHEN content IS NULL THEN COALESCE(proposal->>'caption','') ELSE content->>'message' END,
       CASE WHEN content IS NULL THEN CASE WHEN NULLIF(proposal->>'mediaUrl','') IS NULL THEN '{}'::text[] ELSE ARRAY[proposal->>'mediaUrl'] END WHEN content->'poster'='null'::jsonb THEN '{}'::text[] ELSE ARRAY[content->'poster'->>'url'] END,
       CASE WHEN content IS NULL THEN CASE WHEN NULLIF(proposal->>'mediaUrl','') IS NULL THEN '{}'::text[] ELSE ARRAY[COALESCE(proposal->>'mediaAlt','')] END WHEN content->'poster'='null'::jsonb THEN '{}'::text[] ELSE ARRAY[content->'poster'->>'alt_text'] END,
       (proposal->>'eventScheduleId')::uuid,(proposal->>'sourceDate')::date,proposal->>'milestone',
       (proposal->'suggestions'->ch->>'date')::date,(proposal->'suggestions'->ch->>'slot')::time_slot,
       CASE WHEN ch LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform WHEN ch='whatsapp' THEN 'whatsapp'::social_schedule_platform ELSE 'tiktok'::social_schedule_platform END,
       'proposed',c.created_by,c.default_assigned_to)
     ON CONFLICT(campaign_id,source_schedule_id,source_date,reminder_milestone,channel) DO NOTHING;
     GET DIAGNOSTICS added=ROW_COUNT; inserted:=inserted+added;
   END LOOP;
 END LOOP;
 IF jsonb_array_length(p_suppressed)>0 THEN
   INSERT INTO audit_logs(user_id,entity_type,entity_id,action,detail) VALUES(COALESCE(auth.uid(),c.created_by),'social_campaign',c.id::text,'generation_suppressed',p_suppressed::text);
 END IF;
 UPDATE social_campaigns SET launch_schedule_id=p_launch_schedule_id,launch_occurrence_at=p_launch_at,launch_decision_made=p_launch_decision_made,
   generated_through=p_generated_through,last_generated_at=now(),next_generation_at=(p_generated_through::timestamp AT TIME ZONE 'America/Toronto')-make_interval(days=>generation_lead_days)
 WHERE id=c.id;
 RETURN inserted;
END $$;

COMMIT;
