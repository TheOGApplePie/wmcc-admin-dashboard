-- Combined unapplied social permission and table changes; replaces the former 032/033 pair.
-- Deploy with the publishing worker paused. This migration preserves channel posts
-- and publication results; it does not recreate event sessions.
BEGIN;
LOCK TABLE social_campaigns, social_posts, social_post_variants, social_deliveries,
  social_campaign_occurrences, social_campaign_reviews, social_post_review_items IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM social_deliveries WHERE status IN ('processing','provider_processing')) THEN
    RAISE EXCEPTION 'Finish in-flight social publications and pause the worker before migration 032.';
  END IF;
  IF EXISTS (SELECT 1 FROM social_campaign_occurrences o
    WHERE o.generated AND o.event_occurrence_at>=now() AND o.event_schedule_id IS NULL AND o.event_occurrence_id IS NULL
      AND EXISTS(SELECT 1 FROM social_posts p WHERE p.campaign_occurrence_id=o.id)) THEN
    RAISE EXCEPTION 'Link existing future generated reminders to their schedules before migration 032 to prevent duplicate posts.';
  END IF;
  IF EXISTS (SELECT 1 FROM social_posts WHERE campaign_id IS NULL) THEN
    RAISE EXCEPTION 'Assign existing social posts to campaigns before migration 032.';
  END IF;
  IF EXISTS (SELECT 1 FROM social_posts p WHERE NOT EXISTS(SELECT 1 FROM social_post_variants v WHERE v.post_id=p.id)) THEN
    RAISE EXCEPTION 'Existing posts without channels need a channel before migration 032.';
  END IF;
END $$;

-- Keep existing publishing access: either effective schedule or send authority becomes publish.
-- Review/override access alone does not grant publishing. Explicit publish overrides win.
ALTER TABLE profiles DISABLE TRIGGER trg_guard_profile_permission_update;
ALTER TABLE profiles DISABLE TRIGGER trg_guard_self_access;
UPDATE profiles SET permission_overrides =
  (COALESCE(permission_overrides,'{}') - 'social.schedule' - 'social.send' - 'social.review' - 'social.override') ||
  jsonb_build_object('social.publish', COALESCE((permission_overrides->>'social.publish')::boolean,
    COALESCE((permission_overrides->>'social.schedule')::boolean,role::text IN ('board','management')) OR
    COALESCE((permission_overrides->>'social.send')::boolean,role::text IN ('board','management'))));
ALTER TABLE profiles ENABLE TRIGGER trg_guard_self_access;
ALTER TABLE profiles ENABLE TRIGGER trg_guard_profile_permission_update;
CREATE OR REPLACE FUNCTION has_perm(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role member_role;
  v_status member_status;
  v_overrides JSONB;
  v_key TEXT := p_module || '.' || p_action;
  v_preset BOOLEAN;
BEGIN
  -- Older RPCs and RLS policies resolve to the same canonical permission.
  IF p_module='social' AND p_action IN ('schedule','send','review','override') THEN v_key:='social.publish'; END IF;
  SELECT role, status, permission_overrides INTO v_role, v_status, v_overrides
    FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_status <> 'active' THEN RETURN FALSE; END IF;
  IF v_role::TEXT = 'board' THEN RETURN TRUE; END IF;
  v_preset := CASE v_role::TEXT
    WHEN 'management' THEN v_key IN (
      'announcements.view', 'announcements.edit', 'announcements.publish', 'announcements.delete',
      'events.view', 'events.edit', 'events.publish', 'events.delete',
      'social.view', 'social.edit', 'social.publish', 'social.delete',
      'feedback.view', 'feedback.respond', 'users.view'
    )
    WHEN 'general' THEN v_key IN (
      'announcements.view', 'announcements.edit', 'events.view', 'events.edit',
      'social.view', 'social.edit', 'feedback.view'
    )
    ELSE FALSE
  END;
  IF v_overrides ? v_key THEN RETURN (v_overrides ->> v_key)::BOOLEAN; END IF;
  RETURN COALESCE(v_preset, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION get_my_access()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_permissions JSONB;
BEGIN
  SELECT * INTO v_profile
    FROM profiles
   WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('profile', NULL, 'permissions', '{}'::JSONB);
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(permission_key, has_perm(module_key, action_key)),
    '{}'::JSONB
  ) INTO v_permissions
  FROM (VALUES
    ('announcements.view', 'announcements', 'view'),
    ('announcements.edit', 'announcements', 'edit'),
    ('announcements.publish', 'announcements', 'publish'),
    ('announcements.delete', 'announcements', 'delete'),
    ('events.view', 'events', 'view'),
    ('events.edit', 'events', 'edit'),
    ('events.publish', 'events', 'publish'),
    ('events.delete', 'events', 'delete'),
    ('social.view', 'social', 'view'),
    ('social.edit', 'social', 'edit'),
    ('social.publish', 'social', 'publish'),
    ('social.delete', 'social', 'delete'),
    ('feedback.view', 'feedback', 'view'),
    ('feedback.respond', 'feedback', 'respond'),
    ('users.view', 'users', 'view'),
    ('users.manage', 'users', 'manage'),
    ('users.delete', 'users', 'delete'),
    ('integrations.manage', 'integrations', 'manage')
  ) AS permission_list(permission_key, module_key, action_key);

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'displayName', v_profile.display_name,
      'role', v_profile.role,
      'status', v_profile.status
    ),
    'permissions', CASE
      WHEN v_profile.status = 'active'::member_status THEN v_permissions
      ELSE '{}'::JSONB
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_access() TO authenticated;


CREATE FUNCTION guard_social_campaign_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF auth.role()='service_role' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' AND NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
  ELSE
    -- Event unpublication/deletion may hold its campaign without granting social publishing.
    IF pg_trigger_depth()>1 AND NEW.status='draft' THEN RETURN NEW; END IF;
    IF NEW.status='archived' AND OLD.status<>'archived' AND NOT has_perm('social','delete') THEN RAISE EXCEPTION 'Permission denied: social.delete'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'archived' AND NOT has_perm('social','publish') THEN
      RAISE EXCEPTION 'Permission denied: social.publish';
    END IF;
    IF OLD.status='active' AND NEW.status='active' AND
      ROW(NEW.event_id,NEW.starts_on,NEW.ends_on,NEW.default_channels,NEW.generation_enabled,NEW.generation_horizon_days,NEW.generation_lead_days)
      IS DISTINCT FROM
      ROW(OLD.event_id,OLD.starts_on,OLD.ends_on,OLD.default_channels,OLD.generation_enabled,OLD.generation_horizon_days,OLD.generation_lead_days)
      THEN NEW.status:='draft'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_social_campaign_publication_permission BEFORE INSERT OR UPDATE ON social_campaigns
FOR EACH ROW EXECUTE FUNCTION guard_social_campaign_publication();


-- Keep resolved review history in the existing audit log, not another social table.
INSERT INTO audit_logs(user_id,entity_type,entity_id,action,detail)
SELECT COALESCE(r.resolved_by,c.created_by),'social_campaign',c.id::text,'review_history',
  (to_jsonb(r)||jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM social_post_review_items i WHERE i.review_id=r.id),'[]'::jsonb)))::text
FROM social_campaign_reviews r JOIN social_campaigns c ON c.id=r.campaign_id;

CREATE TABLE social_posts_next (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES social_campaigns(id) ON DELETE RESTRICT,
  channel social_variant_channel NOT NULL,
  title text NOT NULL,
  caption text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  media_urls text[] NOT NULL DEFAULT '{}',
  media_alt_texts text[] NOT NULL DEFAULT '{}',
  cover_media_url text,
  overlay_text text,
  call_to_action_link text,
  call_to_action_caption text,
  source_schedule_id uuid,
  source_date date,
  reminder_milestone text,
  scheduled_date date,
  time_slot time_slot,
  scheduled_at timestamptz,
  schedule_platform social_schedule_platform NOT NULL,
  status social_delivery_status NOT NULL DEFAULT 'draft',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  publication_consented_at timestamptz,
  publication_consented_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_id text,
  external_url text,
  provider_error text,
  attempt_count smallint NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  retryable boolean NOT NULL DEFAULT true,
  provider_processing_started_at timestamptz,
  idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  needs_review boolean NOT NULL DEFAULT false,
  review_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (attempt_count>=0),
  CHECK ((status IN ('draft','proposed','cancelled') AND scheduled_at IS NULL)
    OR (status NOT IN ('draft','proposed','cancelled') AND scheduled_date IS NOT NULL AND time_slot IS NOT NULL AND scheduled_at IS NOT NULL)),
  CHECK (status NOT IN ('sent','skipped') OR sent_at IS NOT NULL),
  CHECK (cardinality(media_urls)=cardinality(media_alt_texts)),
  CHECK (cardinality(media_urls)<=10 AND (channel='instagram_feed' OR cardinality(media_urls)<=1)),
  CHECK ((source_schedule_id IS NULL AND source_date IS NULL AND reminder_milestone IS NULL)
    OR (source_schedule_id IS NOT NULL AND source_date IS NOT NULL AND reminder_milestone IS NOT NULL)),
  UNIQUE(campaign_id,source_schedule_id,source_date,reminder_milestone,channel)
);
-- Source identifiers deliberately survive schedule deletion, preserving deduplication
-- and history. New writes validate that the source belongs to the campaign's event.
INSERT INTO social_posts_next (
  id,campaign_id,channel,title,caption,description,hashtags,media_urls,media_alt_texts,
  cover_media_url,overlay_text,call_to_action_link,call_to_action_caption,
  source_schedule_id,source_date,reminder_milestone,
  scheduled_date,time_slot,scheduled_at,schedule_platform,status,assigned_to,created_by,
  publication_consented_at,publication_consented_by,sent_at,sent_by,external_id,external_url,
  provider_error,attempt_count,last_attempt_at,next_attempt_at,retryable,provider_processing_started_at,
  idempotency_key,needs_review,review_reason,created_at,updated_at
)
SELECT COALESCE(d.id,v.id),p.campaign_id,v.channel,p.title,v.caption,
  COALESCE(NULLIF(v.description,''),p.description,''),v.hashtags,
  CASE WHEN jsonb_array_length(v.media_items)>0 THEN ARRAY(SELECT x->>'url' FROM jsonb_array_elements(v.media_items) x)
    WHEN COALESCE(v.media_url,p.media_url) IS NOT NULL THEN ARRAY[COALESCE(v.media_url,p.media_url)] ELSE '{}' END,
  CASE WHEN jsonb_array_length(v.media_items)>0 THEN ARRAY(SELECT COALESCE(x->>'alt_text','') FROM jsonb_array_elements(v.media_items) x)
    WHEN COALESCE(v.media_url,p.media_url) IS NOT NULL THEN ARRAY[''] ELSE '{}' END,
  v.cover_media_url,v.overlay_text,v.call_to_action_link,v.call_to_action_caption,
  COALESCE(o.event_schedule_id,eo.schedule_id),
  CASE WHEN COALESCE(o.event_schedule_id,eo.schedule_id) IS NOT NULL THEN COALESCE(eo.original_key,(o.event_occurrence_at AT TIME ZONE COALESCE(s.time_zone,'America/Toronto'))::date) END,
  CASE WHEN COALESCE(o.event_schedule_id,eo.schedule_id) IS NOT NULL THEN regexp_replace(o.generation_key,'^.*:','') END,
  d.scheduled_date,d.time_slot,d.scheduled_at,
  COALESCE(d.schedule_platform,CASE WHEN v.channel::text LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform WHEN v.channel='whatsapp' THEN 'whatsapp'::social_schedule_platform ELSE 'tiktok'::social_schedule_platform END),
  COALESCE(d.status,'draft'),COALESCE(d.assigned_to,p.assigned_to),COALESCE(p.created_by,c.created_by),
  COALESCE(d.publication_consented_at,CASE WHEN v.channel<>'tiktok_reel' AND d.status IN ('scheduled','due','failed') THEN d.updated_at END),
  d.publication_consented_by,d.sent_at,d.sent_by,d.external_id,d.external_url,
  d.provider_error,COALESCE(d.attempt_count,0),d.last_attempt_at,d.next_attempt_at,COALESCE(d.retryable,true),d.provider_processing_started_at,
  COALESCE(d.idempotency_key,gen_random_uuid()::text),c.needs_review,c.review_reason,COALESCE(d.created_at,v.created_at),COALESCE(d.updated_at,v.updated_at)
FROM social_posts p JOIN social_campaigns c ON c.id=p.campaign_id
JOIN social_post_variants v ON v.post_id=p.id LEFT JOIN social_deliveries d ON d.variant_id=v.id
LEFT JOIN social_campaign_occurrences o ON o.id=p.campaign_occurrence_id
LEFT JOIN event_occurrences eo ON eo.id=o.event_occurrence_id
LEFT JOIN event_schedules s ON s.id=COALESCE(o.event_schedule_id,eo.schedule_id);

-- Record the identifier mapping and legacy generation metadata for audit lookup.
INSERT INTO audit_logs(user_id,entity_type,entity_id,action,detail)
SELECT c.created_by,'social_post',COALESCE(d.id,v.id)::text,'consolidated',
 jsonb_build_object('previous_post_id',p.id,'previous_variant_id',v.id,'proposal',to_jsonb(o),
   'configuration',v.configuration,'validation_errors',v.validation_errors)::text
FROM social_posts p JOIN social_campaigns c ON c.id=p.campaign_id
JOIN social_post_variants v ON v.post_id=p.id LEFT JOIN social_deliveries d ON d.variant_id=v.id
LEFT JOIN social_campaign_occurrences o ON o.id=p.campaign_occurrence_id;

-- Remove the old social workflow routines and their triggers. No CASCADE: any
-- unexpected external dependency aborts the transaction instead of being removed.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT t.tgname,n.nspname,c.relname FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE NOT t.tgisinternal AND n.nspname='public' AND
      (c.relname IN ('social_posts','social_deliveries','social_post_variants','social_campaign_reviews','social_post_review_items','social_campaign_occurrences')
       OR p.proname IN ('trg_social_posts_updated_at',
        'guard_sent_social_delivery',
        'guard_social_delivery_transition',
        'guard_social_campaign_review_clear',
        'guard_sent_social_variant',
        'guard_social_post_status_transition',
        'flag_social_campaigns_for_event_review',
        'flag_social_campaigns_for_rrule_review',
        'open_current_social_campaign_review',
        'persist_social_campaign_proposals',
        'persist_social_campaign_proposals_internal',
        'delete_social_delivery_post',
        'create_manual_social_post',
        'valid_social_media_items',
        'sync_social_variant_media_items',
        'enforce_automated_social_delivery',
        'sync_social_delivery_next_attempt',
        'normalize_social_delivery_schedule',
        'enforce_social_campaign_schedule',
        'sync_social_post_from_deliveries',
        'claim_social_deliveries',
        'complete_social_delivery_attempt',
        'refresh_social_review_items',
        'refresh_social_review_items_trigger',
        'resolve_social_campaign_review',
        'update_social_delivery_post',
        'recover_stuck_social_deliveries',
        'require_active_campaign_for_scheduling',
        'reset_social_provider_processing_state',
        'mark_social_delivery_provider_processing',
        'link_legacy_event_campaign_occurrences',
        'persist_event_campaign_proposals',
        'persist_schedule_campaign_proposals'))
  LOOP EXECUTE format('DROP TRIGGER %I ON %I.%I',r.tgname,r.nspname,r.relname); END LOOP;
END $$;
DROP TABLE social_post_review_items;
ALTER TABLE social_campaign_occurrences DROP COLUMN review_id;
DROP TABLE social_campaign_reviews;
DROP TABLE social_deliveries;
DROP TABLE social_post_variants;
DROP TABLE social_posts;
DROP TABLE social_campaign_occurrences;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND
      p.proname IN ('trg_social_posts_updated_at',
        'guard_sent_social_delivery',
        'guard_social_delivery_transition',
        'guard_social_campaign_review_clear',
        'guard_sent_social_variant',
        'guard_social_post_status_transition',
        'flag_social_campaigns_for_event_review',
        'flag_social_campaigns_for_rrule_review',
        'open_current_social_campaign_review',
        'persist_social_campaign_proposals',
        'persist_social_campaign_proposals_internal',
        'delete_social_delivery_post',
        'create_manual_social_post',
        'valid_social_media_items',
        'sync_social_variant_media_items',
        'enforce_automated_social_delivery',
        'sync_social_delivery_next_attempt',
        'normalize_social_delivery_schedule',
        'enforce_social_campaign_schedule',
        'sync_social_post_from_deliveries',
        'claim_social_deliveries',
        'complete_social_delivery_attempt',
        'refresh_social_review_items',
        'refresh_social_review_items_trigger',
        'resolve_social_campaign_review',
        'update_social_delivery_post',
        'recover_stuck_social_deliveries',
        'require_active_campaign_for_scheduling',
        'reset_social_provider_processing_state',
        'mark_social_delivery_provider_processing',
        'link_legacy_event_campaign_occurrences',
        'persist_event_campaign_proposals',
        'persist_schedule_campaign_proposals')
  LOOP EXECUTE format('DROP FUNCTION %s',r.signature); END LOOP;
END $$;
DROP TYPE social_occurrence_kind, social_delivery_method, social_channel, social_post_status;
ALTER TYPE social_variant_channel RENAME TO social_post_channel;
ALTER TYPE social_delivery_status RENAME TO social_post_status;
ALTER TABLE social_posts_next RENAME TO social_posts;
ALTER TABLE social_campaigns DROP COLUMN launch_occurrence_id;
ALTER TABLE social_campaigns ADD COLUMN version integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX social_posts_slot ON social_posts(schedule_platform,scheduled_date,time_slot)
WHERE status IN ('proposed','scheduled','due','processing','provider_processing') OR (status='failed' AND retryable);
CREATE INDEX social_posts_campaign ON social_posts(campaign_id);
CREATE INDEX social_posts_due ON social_posts(next_attempt_at) WHERE retryable AND status IN ('scheduled','failed','provider_processing');
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_posts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON social_posts TO authenticated;
GRANT ALL ON social_posts TO service_role;
CREATE POLICY social_posts_read ON social_posts FOR SELECT TO authenticated USING(has_perm('social','view'));

CREATE FUNCTION touch_social_post() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.version:=OLD.version+1; NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER social_posts_updated BEFORE UPDATE ON social_posts FOR EACH ROW EXECUTE FUNCTION touch_social_post();

CREATE FUNCTION social_campaign_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  NEW.version:=OLD.version+1;
  IF ROW(NEW.event_id,NEW.starts_on,NEW.ends_on,NEW.default_channels) IS DISTINCT FROM ROW(OLD.event_id,OLD.starts_on,OLD.ends_on,OLD.default_channels)
     OR (NEW.needs_review AND (NOT OLD.needs_review OR ROW(NEW.current_event_snapshot,NEW.review_reason) IS DISTINCT FROM ROW(OLD.current_event_snapshot,OLD.review_reason))) THEN
    NEW.generated_through:=NULL; NEW.next_generation_at:=now();
    UPDATE social_posts SET status='draft',scheduled_at=NULL,next_attempt_at=NULL,
      publication_consented_at=NULL,publication_consented_by=NULL,needs_review=true,
      review_reason=COALESCE(NEW.review_reason,'Campaign settings changed.'),version=version+1,updated_at=now()
    WHERE campaign_id=NEW.id AND status IN ('draft','proposed','scheduled','due','failed');
  END IF;
  IF OLD.needs_review AND NOT NEW.needs_review AND NOT has_perm('social','publish') AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied: social.publish';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER social_campaign_change BEFORE UPDATE ON social_campaigns FOR EACH ROW EXECUTE FUNCTION social_campaign_change();

CREATE FUNCTION open_current_social_campaign_review(p_event_id bigint,p_reason text,p_snapshot jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE social_campaigns SET needs_review=true,review_reason=p_reason,
    current_event_snapshot=COALESCE(p_snapshot,social_event_snapshot(p_event_id)),generated_through=NULL,next_generation_at=now()
  WHERE event_id=p_event_id;
END $$;
REVOKE ALL ON FUNCTION open_current_social_campaign_review(bigint,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION acknowledge_social_campaign(p_campaign_id uuid,p_version integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
  UPDATE social_campaigns SET needs_review=false,review_reason=NULL,schedule_event_snapshot=current_event_snapshot
    WHERE id=p_campaign_id AND version=p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign changed. Reload before reviewing.'; END IF;
  INSERT INTO audit_logs(user_id,entity_type,entity_id,action,detail)
    VALUES(auth.uid(),'social_campaign',p_campaign_id::text,'review','Campaign changes acknowledged; held posts require individual approval.');
END $$;

CREATE FUNCTION save_social_post(
 p_id uuid,p_version integer,p_campaign_id uuid,p_title text,p_description text,p_caption text,
 p_media_urls text[],p_media_alt_texts text[],p_hashtags text[],p_call_to_action_link text,p_call_to_action_caption text,
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
   IF old_post.status IN ('due','processing','provider_processing','sent','skipped','cancelled') THEN RAISE EXCEPTION 'This post can no longer be edited.'; END IF;
 END IF;
 IF length(btrim(COALESCE(p_title,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'A title is required (up to 120 characters).'; END IF;
 IF p_media_urls IS NULL OR p_media_alt_texts IS NULL OR cardinality(p_media_urls)<>cardinality(p_media_alt_texts)
   OR EXISTS(SELECT 1 FROM unnest(p_media_urls) u WHERE u IS NULL OR u !~ '^https://') THEN RAISE EXCEPTION 'Invalid media selection.'; END IF;
 IF NULLIF(p_call_to_action_link,'') IS NOT NULL AND p_call_to_action_link !~ '^https://' THEN RAISE EXCEPTION 'CTA URL must use HTTPS.'; END IF;
 IF p_mode='scheduled' THEN
   IF NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
   IF c.status<>'active' OR c.needs_review THEN RAISE EXCEPTION 'Activate and review the campaign before publishing.'; END IF;
   IF c.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM events WHERE id=c.event_id AND publication_status='published') THEN RAISE EXCEPTION 'Publish the linked event first.'; END IF;
   due_at:=social_slot_scheduled_at(p_scheduled_date,p_time_slot);
   IF due_at IS NULL OR due_at<=now() THEN RAISE EXCEPTION 'Choose a future date and time slot.'; END IF;
   IF (c.starts_on IS NOT NULL AND p_scheduled_date<c.starts_on) OR (c.ends_on IS NOT NULL AND p_scheduled_date>c.ends_on) THEN RAISE EXCEPTION 'The scheduled date is outside the campaign dates.'; END IF;
   IF btrim(COALESCE(p_caption,''))='' OR (p_channel<>'whatsapp' AND cardinality(p_media_urls)=0) THEN RAISE EXCEPTION 'Caption and platform media are required.'; END IF;
   IF p_channel IN ('instagram_feed','instagram_story') AND EXISTS(SELECT 1 FROM unnest(p_media_alt_texts) a WHERE btrim(COALESCE(a,''))='') THEN RAISE EXCEPTION 'Alt text is required for every Instagram image.'; END IF;
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
 INSERT INTO social_posts(id,campaign_id,title,description,caption,media_urls,media_alt_texts,hashtags,call_to_action_link,call_to_action_caption,
   channel,schedule_platform,scheduled_date,time_slot,scheduled_at,status,created_by,assigned_to,publication_consented_at,publication_consented_by,next_attempt_at)
 VALUES(COALESCE(p_id,gen_random_uuid()),c.id,p_title,COALESCE(p_description,''),COALESCE(p_caption,''),p_media_urls,p_media_alt_texts,COALESCE(p_hashtags,'{}'),NULLIF(p_call_to_action_link,''),NULLIF(p_call_to_action_caption,''),
   p_channel,CASE WHEN p_channel::text LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform WHEN p_channel='whatsapp' THEN 'whatsapp'::social_schedule_platform ELSE 'tiktok'::social_schedule_platform END,
   p_scheduled_date,p_time_slot,due_at,p_mode::social_post_status,auth.uid(),c.default_assigned_to,
   CASE WHEN p_mode='scheduled' THEN now() END,CASE WHEN p_mode='scheduled' THEN auth.uid() END,due_at)
 ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,caption=EXCLUDED.caption,media_urls=EXCLUDED.media_urls,media_alt_texts=EXCLUDED.media_alt_texts,
   hashtags=EXCLUDED.hashtags,call_to_action_link=EXCLUDED.call_to_action_link,call_to_action_caption=EXCLUDED.call_to_action_caption,channel=EXCLUDED.channel,schedule_platform=EXCLUDED.schedule_platform,
   scheduled_date=EXCLUDED.scheduled_date,time_slot=EXCLUDED.time_slot,scheduled_at=EXCLUDED.scheduled_at,status=EXCLUDED.status,
   publication_consented_at=EXCLUDED.publication_consented_at,publication_consented_by=EXCLUDED.publication_consented_by,next_attempt_at=EXCLUDED.next_attempt_at,
   attempt_count=0,retryable=true,provider_error=NULL,external_id=NULL,provider_processing_started_at=NULL,
   needs_review=CASE WHEN p_mode='scheduled' THEN false ELSE social_posts.needs_review END,
   review_reason=CASE WHEN p_mode='scheduled' THEN NULL ELSE social_posts.review_reason END,version=social_posts.version+1,updated_at=now()
 RETURNING * INTO result;
 RETURN result;
END $$;

CREATE FUNCTION delete_social_post(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p social_posts%ROWTYPE;
BEGIN
 IF NOT has_perm('social','delete') THEN RAISE EXCEPTION 'Permission denied: social.delete'; END IF;
 SELECT * INTO p FROM social_posts WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Post not found.'; END IF;
 IF p.status IN ('processing','provider_processing','sent','skipped') THEN RAISE EXCEPTION 'Publication history cannot be deleted.'; END IF;
 -- A cancelled generated post keeps its source identity so generation cannot recreate it.
 IF p.source_schedule_id IS NOT NULL THEN
   UPDATE social_posts SET status='cancelled',scheduled_at=NULL,next_attempt_at=NULL,publication_consented_at=NULL,publication_consented_by=NULL,version=version+1,updated_at=now() WHERE id=p_id;
 ELSE DELETE FROM social_posts WHERE id=p_id; END IF;
END $$;


CREATE FUNCTION recover_stuck_social_posts(
  p_stale_before TIMESTAMPTZ
)
RETURNS TABLE (
  delivery_id UUID,
  platform social_schedule_platform,
  attempt_number SMALLINT,
  terminal BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required.';
  END IF;
  RETURN QUERY
  UPDATE social_posts delivery
     SET status = 'failed',
         retryable = delivery.attempt_count < 3,
         next_attempt_at = CASE WHEN delivery.attempt_count < 3 THEN NOW() ELSE NULL END,
         provider_error = 'The publishing worker stopped before completing this attempt.'
   WHERE delivery.status = 'processing'
     AND delivery.last_attempt_at < p_stale_before
  RETURNING delivery.id, delivery.schedule_platform, delivery.attempt_count,
            delivery.attempt_count >= 3;
END;
$$;

CREATE FUNCTION mark_social_delivery_provider_processing(
  p_delivery_id UUID, p_provider_post_id TEXT, p_message TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
  UPDATE social_posts
     SET status = 'provider_processing', external_id = COALESCE(p_provider_post_id, external_id),
         provider_error = LEFT(COALESCE(p_message, 'Provider is processing the publication.'), 2000),
         retryable = TRUE, next_attempt_at = NOW(),
         provider_processing_started_at = COALESCE(provider_processing_started_at, NOW())
   WHERE id = p_delivery_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery is not processing.'; END IF;
END;
$$;

CREATE FUNCTION complete_social_delivery_attempt(
  p_delivery_id UUID,
  p_success BOOLEAN,
  p_provider_post_id TEXT DEFAULT NULL,
  p_external_url TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_retryable BOOLEAN DEFAULT TRUE
)
RETURNS social_post_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_delivery social_posts%ROWTYPE; v_status social_post_status;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
  SELECT * INTO v_delivery FROM social_posts WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND OR v_delivery.status <> 'processing' THEN RAISE EXCEPTION 'Delivery is not processing.'; END IF;
  IF p_success THEN
    v_status := 'sent';
    UPDATE social_posts SET status = v_status, sent_at = NOW(), sent_by = NULL,
      external_id = p_provider_post_id, external_url = p_external_url,
      provider_error = NULL, retryable = FALSE, next_attempt_at = NULL
    WHERE id = p_delivery_id;
  ELSE
    v_status := 'failed';
    UPDATE social_posts SET status = v_status,
      external_id = COALESCE(p_provider_post_id, external_id),
      provider_error = LEFT(COALESCE(p_error, 'Unknown provider failure.'), 2000),
      retryable = p_retryable AND attempt_count < 3,
      next_attempt_at = CASE WHEN p_retryable AND attempt_count < 3 THEN NOW() ELSE NULL END
    WHERE id = p_delivery_id;
  END IF;
  RETURN v_status;
END;
$$;

CREATE FUNCTION claim_social_posts(p_limit integer DEFAULT 20)
RETURNS TABLE(delivery_id uuid,platform social_schedule_platform,channel social_post_channel,
 caption text,description text,media_items jsonb,attempt_number smallint,idempotency_key text,external_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
 RETURN QUERY WITH claimed AS (
   SELECT p.id,p.status='provider_processing' AS poll FROM social_posts p JOIN social_campaigns c ON c.id=p.campaign_id
   WHERE p.status IN ('scheduled','failed','provider_processing') AND p.retryable AND p.next_attempt_at<=now()
    AND (p.status='provider_processing' OR (c.status='active' AND NOT c.needs_review AND NOT p.needs_review
      AND p.publication_consented_at IS NOT NULL AND p.attempt_count<3
      AND (c.event_id IS NULL OR EXISTS(SELECT 1 FROM events e WHERE e.id=c.event_id AND e.publication_status='published'))))
   ORDER BY p.next_attempt_at,p.created_at FOR UPDATE OF p,c SKIP LOCKED LIMIT greatest(1,least(p_limit,100))
 ), changed AS (
   UPDATE social_posts p SET status='processing',attempt_count=p.attempt_count+CASE WHEN claimed.poll THEN 0 ELSE 1 END,
     last_attempt_at=now(),next_attempt_at=NULL,provider_error=NULL,version=p.version+1,updated_at=now()
   FROM claimed WHERE p.id=claimed.id RETURNING p.*
 ) SELECT p.id,p.schedule_platform,p.channel,p.caption,p.description,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('url',p.media_urls[i],'alt_text',p.media_alt_texts[i]) ORDER BY i)
     FROM generate_subscripts(p.media_urls,1) i),'[]'::jsonb),p.attempt_count,p.idempotency_key,p.external_id FROM changed p;
END $$;

CREATE FUNCTION persist_schedule_campaign_proposals(
 p_campaign_id uuid,p_campaign_version integer,p_event_version integer,p_proposals jsonb,p_suppressed jsonb,
 p_generated_through date,p_launch_schedule_id uuid,p_launch_at timestamptz,p_launch_decision_made boolean
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c social_campaigns%ROWTYPE; e events%ROWTYPE; proposal jsonb; ch text; added integer; inserted integer:=0;
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
     INSERT INTO social_posts(campaign_id,channel,title,caption,description,media_urls,media_alt_texts,call_to_action_link,call_to_action_caption,
       source_schedule_id,source_date,reminder_milestone,scheduled_date,time_slot,schedule_platform,status,created_by,assigned_to)
     VALUES(c.id,ch::social_post_channel,proposal->>'title',COALESCE(proposal->>'caption',''),COALESCE(proposal->>'description',''),
       CASE WHEN NULLIF(proposal->>'mediaUrl','') IS NULL THEN '{}'::text[] ELSE ARRAY[proposal->>'mediaUrl'] END,
       CASE WHEN NULLIF(proposal->>'mediaUrl','') IS NULL THEN '{}'::text[] ELSE ARRAY[COALESCE(proposal->>'mediaAlt','')] END,
       NULLIF(proposal->>'callToActionLink',''),NULLIF(proposal->>'callToActionCaption',''),
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

-- RPCs are the only authenticated write path for posts.
REVOKE ALL ON FUNCTION save_social_post(uuid,integer,uuid,text,text,text,text[],text[],text[],text,text,social_post_channel,text,date,time_slot) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION save_social_post(uuid,integer,uuid,text,text,text,text[],text[],text[],text,text,social_post_channel,text,date,time_slot) TO authenticated;
REVOKE ALL ON FUNCTION delete_social_post(uuid),acknowledge_social_campaign(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION delete_social_post(uuid),acknowledge_social_campaign(uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION persist_schedule_campaign_proposals(uuid,integer,integer,jsonb,jsonb,date,uuid,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION persist_schedule_campaign_proposals(uuid,integer,integer,jsonb,jsonb,date,uuid,timestamptz,boolean) TO authenticated,service_role;
REVOKE ALL ON FUNCTION claim_social_posts(integer),recover_stuck_social_posts(timestamptz),mark_social_delivery_provider_processing(uuid,text,text),complete_social_delivery_attempt(uuid,boolean,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_social_posts(integer),recover_stuck_social_posts(timestamptz),mark_social_delivery_provider_processing(uuid,text,text),complete_social_delivery_attempt(uuid,boolean,text,text,text,boolean) TO service_role;
COMMIT;
