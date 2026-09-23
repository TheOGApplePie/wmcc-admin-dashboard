-- 020: Structured, ordered media for platform variants plus review permission.

ALTER TABLE social_post_variants
  ADD COLUMN media_items JSONB NOT NULL DEFAULT '[]'::JSONB;

UPDATE social_post_variants
   SET media_items = jsonb_build_array(jsonb_build_object('url', media_url, 'alt_text', ''))
 WHERE media_url IS NOT NULL AND media_url <> '';

CREATE OR REPLACE FUNCTION valid_social_media_items(p_channel social_variant_channel, p_items JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_item JSONB; v_count INTEGER;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN RETURN FALSE; END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count > 10 OR (p_channel <> 'instagram_feed' AND v_count > 1) THEN RETURN FALSE; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR COALESCE(v_item->>'url', '') !~ '^https://'
       OR COALESCE(jsonb_typeof(v_item->'alt_text'), '') <> 'string' THEN RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

ALTER TABLE social_post_variants
  ADD CONSTRAINT social_variant_media_items_valid
  CHECK (valid_social_media_items(channel, media_items));

CREATE OR REPLACE FUNCTION sync_social_variant_media_items()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_array_length(NEW.media_items) = 0 AND NEW.media_url IS NOT NULL AND NEW.media_url <> '' THEN
    NEW.media_items := jsonb_build_array(jsonb_build_object('url', NEW.media_url, 'alt_text', ''));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_variant_media_items_sync
  BEFORE INSERT OR UPDATE OF media_url, media_items ON social_post_variants
  FOR EACH ROW EXECUTE FUNCTION sync_social_variant_media_items();

-- Board members always render review verdicts. Management and general members
-- receive it from their preset or an explicit per-user override.
CREATE OR REPLACE FUNCTION has_perm(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role member_role;
  v_status member_status;
  v_overrides JSONB;
  v_key TEXT := p_module || '.' || p_action;
  v_preset BOOLEAN;
BEGIN
  SELECT role, status, permission_overrides INTO v_role, v_status, v_overrides
    FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_status <> 'active' THEN RETURN FALSE; END IF;
  IF v_role::TEXT = 'board' THEN RETURN TRUE; END IF;
  v_preset := CASE v_role::TEXT
    WHEN 'management' THEN v_key IN (
      'announcements.view', 'announcements.edit', 'announcements.publish', 'announcements.delete',
      'events.view', 'events.edit', 'events.publish', 'events.delete',
      'social.view', 'social.edit', 'social.schedule', 'social.send', 'social.review', 'social.override', 'social.delete',
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

DROP POLICY IF EXISTS social_campaign_reviews_update ON social_campaign_reviews;
CREATE POLICY social_campaign_reviews_update ON social_campaign_reviews
  FOR UPDATE USING (has_perm('social', 'review')) WITH CHECK (has_perm('social', 'review'));
DROP POLICY IF EXISTS social_post_review_items_update ON social_post_review_items;
CREATE POLICY social_post_review_items_update ON social_post_review_items
  FOR UPDATE USING (has_perm('social', 'review')) WITH CHECK (has_perm('social', 'review'));

CREATE OR REPLACE FUNCTION guard_social_campaign_review_clear()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.needs_review AND NOT NEW.needs_review
     AND auth.role() <> 'service_role'
     AND NOT has_perm('social', 'review') THEN
    RAISE EXCEPTION 'Permission denied: social.review';
  END IF;
  RETURN NEW;
END;
$$;
