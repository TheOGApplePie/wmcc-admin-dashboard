-- Publisher identity is distinct from campaign assignment and post creation.
BEGIN;
ALTER TABLE social_posts ADD COLUMN publisher_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE social_posts SET publisher_user_id=publication_consented_by WHERE publication_consented_at IS NOT NULL;
COMMENT ON COLUMN social_posts.publisher_user_id IS 'User who approved publication; WhatsApp sends from this user account.';

CREATE OR REPLACE FUNCTION has_permission_for_user(p_user_id uuid, p_module TEXT, p_action TEXT)
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
    FROM profiles WHERE id = p_user_id;
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

REVOKE ALL ON FUNCTION has_permission_for_user(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION has_permission_for_user(uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION has_perm(p_module text,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT has_permission_for_user(auth.uid(),p_module,p_action)
$$;

-- The sender uses this RPC with its own service-role client; no user JWT is needed.
CREATE FUNCTION get_whatsapp_publisher(p_user_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE jid text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role required.'; END IF;
 IF NOT has_permission_for_user(p_user_id,'social','publish') THEN
   RAISE EXCEPTION 'Publisher is inactive or lacks social.publish permission.' USING ERRCODE='42501';
 END IF;
 SELECT whatsapp_jid INTO jid FROM whatsapp_accounts WHERE user_id=p_user_id;
 IF jid IS NULL THEN RAISE EXCEPTION 'Publisher has no paired WhatsApp account.' USING ERRCODE='42501'; END IF;
 RETURN jid;
END $$;
REVOKE ALL ON FUNCTION get_whatsapp_publisher(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION get_whatsapp_publisher(uuid) TO service_role;

CREATE FUNCTION guard_social_post_publisher() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='scheduled' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.publication_consented_at IS DISTINCT FROM NEW.publication_consented_at) THEN
   IF NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
   NEW.publisher_user_id:=auth.uid();
   IF NEW.channel='whatsapp' AND NOT EXISTS(SELECT 1 FROM whatsapp_accounts WHERE user_id=NEW.publisher_user_id) THEN
     RAISE EXCEPTION 'Connect your WhatsApp account before approving this post.';
   END IF;
 ELSIF NEW.status IN ('draft','proposed') THEN
   NEW.publisher_user_id:=NULL;
 ELSIF TG_OP='UPDATE' AND NEW.publisher_user_id IS NOT NULL
   AND NEW.publisher_user_id IS DISTINCT FROM OLD.publisher_user_id THEN
   RAISE EXCEPTION 'Publisher changes require publication approval.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER social_post_publisher BEFORE INSERT OR UPDATE ON social_posts
 FOR EACH ROW EXECUTE FUNCTION guard_social_post_publisher();

DROP FUNCTION claim_social_posts(integer);
CREATE FUNCTION claim_social_posts(p_limit integer DEFAULT 20)
RETURNS TABLE(delivery_id uuid,platform social_schedule_platform,channel social_post_channel,
 caption text,description text,media_items jsonb,attempt_number smallint,idempotency_key text,external_id text,publisher_user_id uuid)
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
     FROM generate_subscripts(p.media_urls,1) i),'[]'::jsonb),p.attempt_count,p.idempotency_key,p.external_id,p.publisher_user_id FROM changed p;
END $$;

REVOKE ALL ON FUNCTION claim_social_posts(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_social_posts(integer) TO service_role;
COMMIT;
