-- Consolidate social publishing authority without changing the social table structure.
BEGIN;
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

CREATE OR REPLACE FUNCTION update_social_delivery_post(
  p_delivery_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_caption TEXT,
  p_media_url TEXT,
  p_media_items JSONB,
  p_hashtags TEXT[],
  p_call_to_action_link TEXT,
  p_call_to_action_caption TEXT,
  p_channel social_variant_channel,
  p_mode TEXT,
  p_scheduled_date DATE,
  p_time_slot time_slot
)
RETURNS TABLE (
  post_id UUID,
  variant_id UUID,
  schedule_platform social_schedule_platform,
  scheduled_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_status social_delivery_status;
  v_post_id UUID;
  v_variant_id UUID;
  v_occurrence_id UUID;
  v_platform social_schedule_platform;
  v_scheduled_at TIMESTAMPTZ;
  v_media_count INTEGER;
BEGIN
  IF NOT has_perm('social', 'edit') THEN
    RAISE EXCEPTION 'Permission denied: social.edit';
  END IF;
  IF p_mode NOT IN ('draft', 'scheduled') THEN
    RAISE EXCEPTION 'Invalid post mode.';
  END IF;
  IF jsonb_typeof(COALESCE(p_media_items, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Media items must be an array.';
  END IF;
  v_media_count := jsonb_array_length(COALESCE(p_media_items, '[]'::JSONB));
  IF p_channel <> 'instagram_feed' AND v_media_count > 1 THEN
    RAISE EXCEPTION 'Only Instagram Feed supports multiple media items.';
  END IF;
  IF p_mode = 'scheduled' THEN
    IF length(btrim(COALESCE(p_caption, ''))) = 0 THEN
      RAISE EXCEPTION 'A caption is required to schedule a post.';
    END IF;
    IF p_channel <> 'whatsapp' AND v_media_count = 0 THEN
      RAISE EXCEPTION 'Media is required for this platform.';
    END IF;
    IF p_channel IN ('instagram_feed', 'instagram_story') AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(p_media_items, '[]'::JSONB)) item
       WHERE length(btrim(COALESCE(item->>'alt_text', ''))) = 0
    ) THEN
      RAISE EXCEPTION 'Alt text is required for every Instagram image.';
    END IF;
  END IF;

  SELECT delivery.status, variant.id, post.id, post.campaign_occurrence_id
    INTO v_delivery_status, v_variant_id, v_post_id, v_occurrence_id
    FROM social_deliveries delivery
    JOIN social_post_variants variant ON variant.id = delivery.variant_id
    JOIN social_posts post ON post.id = variant.post_id
   WHERE delivery.id = p_delivery_id
   FOR UPDATE OF delivery, variant, post;
  IF NOT FOUND THEN RAISE EXCEPTION 'Social delivery not found.'; END IF;
  IF v_delivery_status IN ('due', 'processing', 'provider_processing', 'sent', 'skipped') THEN
    RAISE EXCEPTION 'This delivery can no longer be edited.';
  END IF;

  IF p_mode = 'scheduled' THEN
    IF NOT has_perm('social', 'publish') THEN
      RAISE EXCEPTION 'Permission denied: social.publish';
    END IF;
    IF p_scheduled_date IS NULL OR p_time_slot IS NULL THEN
      RAISE EXCEPTION 'A date and time slot are required to schedule a post.';
    END IF;
    v_scheduled_at := social_slot_scheduled_at(p_scheduled_date, p_time_slot);
    IF v_scheduled_at <= NOW() THEN
      RAISE EXCEPTION 'Choose a future time slot before scheduling.';
    END IF;
  END IF;

  v_platform := CASE
    WHEN p_channel::text LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform
    WHEN p_channel = 'whatsapp' THEN 'whatsapp'::social_schedule_platform
    ELSE 'tiktok'::social_schedule_platform
  END;

  UPDATE social_posts
     SET title = p_title,
         description = COALESCE(p_description, ''),
         media_url = NULLIF(p_media_url, ''),
         hashtags = COALESCE(p_hashtags, '{}'),
         call_to_action_link = NULLIF(p_call_to_action_link, ''),
         call_to_action_caption = NULLIF(p_call_to_action_caption, '')
   WHERE id = v_post_id;

  UPDATE social_post_variants
     SET channel = p_channel,
         caption = COALESCE(p_caption, ''),
         description = COALESCE(p_description, ''),
         media_url = NULLIF(p_media_url, ''),
         media_items = COALESCE(p_media_items, '[]'::JSONB),
         hashtags = COALESCE(p_hashtags, '{}'),
         call_to_action_link = NULLIF(p_call_to_action_link, ''),
         call_to_action_caption = NULLIF(p_call_to_action_caption, '')
   WHERE id = v_variant_id;

  UPDATE social_deliveries
     SET schedule_platform = v_platform,
         scheduled_date = p_scheduled_date,
         time_slot = p_time_slot,
         scheduled_at = CASE WHEN p_mode = 'scheduled' THEN v_scheduled_at ELSE NULL END,
         status = p_mode::social_delivery_status,
         publication_consented_at = CASE WHEN p_mode = 'scheduled' THEN NOW() ELSE NULL END,
         publication_consented_by = CASE WHEN p_mode = 'scheduled' THEN auth.uid() ELSE NULL END,
         attempt_count = CASE WHEN p_mode = 'scheduled' THEN 0 ELSE attempt_count END,
         retryable = CASE WHEN p_mode = 'scheduled' THEN TRUE ELSE retryable END,
         next_attempt_at = CASE WHEN p_mode = 'scheduled' THEN v_scheduled_at ELSE NULL END,
         provider_error = CASE WHEN p_mode = 'scheduled' THEN NULL ELSE provider_error END,
         external_id = CASE WHEN p_mode = 'scheduled' THEN NULL ELSE external_id END
   WHERE id = p_delivery_id;

  IF v_occurrence_id IS NOT NULL AND p_mode = 'scheduled' THEN
    UPDATE social_campaign_occurrences
       SET proposal_status = 'confirmed'
     WHERE id = v_occurrence_id
       AND proposal_status = 'proposed'
       AND NOT EXISTS (
         SELECT 1
           FROM social_posts occurrence_post
           JOIN social_post_variants occurrence_variant ON occurrence_variant.post_id = occurrence_post.id
           JOIN social_deliveries occurrence_delivery ON occurrence_delivery.variant_id = occurrence_variant.id
          WHERE occurrence_post.campaign_occurrence_id = v_occurrence_id
            AND occurrence_delivery.status IN ('draft', 'proposed')
       );
  ELSIF v_occurrence_id IS NOT NULL AND p_mode = 'draft' THEN
    UPDATE social_campaign_occurrences
       SET proposal_status = 'proposed'
     WHERE id = v_occurrence_id
       AND generated = TRUE
       AND proposal_status = 'confirmed';
  END IF;

  RETURN QUERY SELECT v_post_id, v_variant_id, v_platform, v_scheduled_at;
END;
$$;

REVOKE ALL ON FUNCTION update_social_delivery_post(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT,
  social_variant_channel, TEXT, DATE, time_slot
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_social_delivery_post(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT,
  social_variant_channel, TEXT, DATE, time_slot
) TO authenticated;


CREATE OR REPLACE FUNCTION guard_social_delivery_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF auth.role()='service_role' THEN RETURN NEW; END IF;
  IF NEW.status='draft' AND NEW.scheduled_at IS NULL AND NEW.publication_consented_at IS NULL
    AND OLD.status IN ('draft','proposed','scheduled','failed','cancelled') AND has_perm('social','edit') THEN RETURN NEW; END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status OR
      ROW(NEW.scheduled_date,NEW.time_slot,NEW.scheduled_at) IS DISTINCT FROM ROW(OLD.scheduled_date,OLD.time_slot,OLD.scheduled_at))
      AND NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
  RETURN NEW;
END;
$$;
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

-- Revoke approval when content changes, including direct authenticated table writes.
CREATE FUNCTION hold_social_post_for_edit(p_post_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_perm('social','edit') THEN RAISE EXCEPTION 'Permission denied: social.edit'; END IF;
  PERFORM d.id FROM social_deliveries d JOIN social_post_variants v ON v.id=d.variant_id
    WHERE v.post_id=p_post_id FOR UPDATE OF d;
  IF EXISTS(SELECT 1 FROM social_deliveries d JOIN social_post_variants v ON v.id=d.variant_id
    WHERE v.post_id=p_post_id AND d.status IN ('due','processing','provider_processing','sent','skipped')) THEN
    RAISE EXCEPTION 'A publishing or delivered post cannot be edited.';
  END IF;
  UPDATE social_deliveries d SET status='draft',scheduled_at=NULL,next_attempt_at=NULL,
    publication_consented_at=NULL,publication_consented_by=NULL
    FROM social_post_variants v WHERE v.id=d.variant_id AND v.post_id=p_post_id AND d.status IN ('scheduled','failed','proposed');
END;
$$;
REVOKE ALL ON FUNCTION hold_social_post_for_edit(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION hold_changed_social_content() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='social_post_variants' THEN
    IF (to_jsonb(NEW)-'updated_at'-'validation_errors') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'validation_errors') THEN
      PERFORM hold_social_post_for_edit(OLD.post_id);
    END IF;
  ELSE
    IF ROW(NEW.campaign_id,NEW.event_id,NEW.title,NEW.caption,NEW.description,NEW.media_url,NEW.hashtags,NEW.call_to_action_link,NEW.call_to_action_caption)
      IS DISTINCT FROM ROW(OLD.campaign_id,OLD.event_id,OLD.title,OLD.caption,OLD.description,OLD.media_url,OLD.hashtags,OLD.call_to_action_link,OLD.call_to_action_caption) THEN
      PERFORM hold_social_post_for_edit(OLD.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER social_post_content_approval AFTER UPDATE ON social_posts FOR EACH ROW EXECUTE FUNCTION hold_changed_social_content();
CREATE TRIGGER social_variant_content_approval BEFORE UPDATE ON social_post_variants FOR EACH ROW EXECUTE FUNCTION hold_changed_social_content();
CREATE OR REPLACE FUNCTION create_manual_social_post(
  p_campaign_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_scheduled_date DATE,
  p_time_slot time_slot,
  p_mode TEXT,
  p_variants JSONB
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign social_campaigns%ROWTYPE;
  v_occurrence_id UUID;
  v_post_id UUID;
  v_variant_id UUID;
  v_item JSONB;
  v_channel social_variant_channel;
  v_platform social_schedule_platform;
  v_scheduled_at TIMESTAMPTZ;
BEGIN
  IF NOT has_perm('social', 'edit') THEN RAISE EXCEPTION 'Permission denied: social.edit'; END IF;
  IF p_mode NOT IN ('draft', 'scheduled') THEN RAISE EXCEPTION 'Invalid post mode.'; END IF;
  IF p_mode = 'scheduled' AND NOT has_perm('social', 'publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
  IF jsonb_array_length(COALESCE(p_variants, '[]'::JSONB)) <> 1 THEN RAISE EXCEPTION 'Select exactly one platform.'; END IF;

  IF p_mode = 'scheduled' AND (p_scheduled_date IS NULL OR p_time_slot IS NULL) THEN
    RAISE EXCEPTION 'A date and time slot are required to schedule a post.';
  END IF;

  SELECT * INTO v_campaign FROM social_campaigns WHERE id = p_campaign_id AND status NOT IN ('completed', 'archived');
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found or no longer accepts posts.'; END IF;

  v_scheduled_at := CASE WHEN p_mode = 'scheduled'
    THEN social_slot_scheduled_at(p_scheduled_date, p_time_slot)
    ELSE NULL
  END;

  IF p_mode = 'scheduled' AND v_scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Choose a future time slot before scheduling.';
  END IF;

  IF p_mode = 'scheduled' AND (
    (v_campaign.starts_on IS NOT NULL AND p_scheduled_date < v_campaign.starts_on)
    OR (v_campaign.ends_on IS NOT NULL AND p_scheduled_date > v_campaign.ends_on)
  ) THEN
    RAISE EXCEPTION 'The scheduled date is outside the campaign dates.';
  END IF;

  -- Standalone cadence is campaign-wide, not platform-wide. Reusing a date
  -- distributes one occurrence to another platform and does not count twice.
  IF p_mode = 'scheduled' AND v_campaign.event_id IS NULL THEN
    IF EXISTS (
      SELECT 1
        FROM social_campaign_occurrences occurrence
        JOIN social_posts post ON post.campaign_occurrence_id = occurrence.id
        JOIN social_post_variants variant ON variant.post_id = post.id
        JOIN social_deliveries delivery ON delivery.variant_id = variant.id
       WHERE occurrence.campaign_id = p_campaign_id
         AND delivery.scheduled_date IS NOT NULL
         AND delivery.scheduled_date <> p_scheduled_date
         AND delivery.status IN ('proposed', 'scheduled', 'due', 'processing', 'failed')
         AND (delivery.status <> 'failed' OR delivery.retryable = TRUE)
         AND ABS(delivery.scheduled_date - p_scheduled_date) < 3
    ) THEN
      RAISE EXCEPTION 'Standalone campaign posts must be at least three calendar days apart.';
    END IF;

    IF (
      SELECT COUNT(DISTINCT delivery.scheduled_date)
        FROM social_campaign_occurrences occurrence
        JOIN social_posts post ON post.campaign_occurrence_id = occurrence.id
        JOIN social_post_variants variant ON variant.post_id = post.id
        JOIN social_deliveries delivery ON delivery.variant_id = variant.id
       WHERE occurrence.campaign_id = p_campaign_id
         AND delivery.scheduled_date <> p_scheduled_date
         AND date_trunc('week', delivery.scheduled_date::TIMESTAMP) = date_trunc('week', p_scheduled_date::TIMESTAMP)
         AND delivery.status IN ('proposed', 'scheduled', 'due', 'processing', 'failed')
         AND (delivery.status <> 'failed' OR delivery.retryable = TRUE)
    ) >= 2 THEN
      RAISE EXCEPTION 'Standalone campaigns may use at most two posting dates in a Monday-to-Sunday week.';
    END IF;
  END IF;

  INSERT INTO social_campaign_occurrences (
    campaign_id, kind, target_date, generation_key, generated, proposal_status
  ) VALUES (
    p_campaign_id, 'standalone', COALESCE(p_scheduled_date, CURRENT_DATE),
    'manual:' || gen_random_uuid()::TEXT, FALSE,
    CASE WHEN p_mode = 'scheduled' THEN 'confirmed' ELSE 'proposed' END
  ) RETURNING id INTO v_occurrence_id;

  INSERT INTO social_posts (
    title, caption, description, channels, status, scheduled_at, media_url,
    event_id, created_by, post_type, time_slot, hashtags, assigned_to,
    campaign_id, campaign_occurrence_id
  ) VALUES (
    p_title, '', COALESCE(p_description, ''), '{}'::social_channel[],
    CASE WHEN p_mode = 'scheduled' THEN 'scheduled'::social_post_status ELSE 'draft'::social_post_status END,
    v_scheduled_at, NULL, v_campaign.event_id, auth.uid(), 'GENERAL',
    p_time_slot, '{}',
    v_campaign.default_assigned_to, p_campaign_id, v_occurrence_id
  ) RETURNING id INTO v_post_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
    v_channel := (v_item->>'channel')::social_variant_channel;
    v_platform := CASE WHEN v_channel LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform WHEN v_channel = 'whatsapp' THEN 'whatsapp'::social_schedule_platform ELSE 'tiktok'::social_schedule_platform END;
    IF p_mode = 'scheduled' AND EXISTS (
      SELECT 1 FROM social_deliveries
       WHERE schedule_platform = v_platform AND scheduled_date = p_scheduled_date
         AND time_slot = p_time_slot
         AND (status IN ('proposed', 'scheduled', 'due', 'processing')
           OR (status = 'failed' AND retryable = TRUE))
    ) THEN RAISE EXCEPTION 'The % slot is already occupied.', v_platform; END IF;

    INSERT INTO social_post_variants (
      post_id, channel, caption, description, hashtags, media_url, media_items,
      call_to_action_link, call_to_action_caption
    ) VALUES (
      v_post_id, v_channel, COALESCE(v_item->>'caption', ''), COALESCE(p_description, ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'hashtags', '[]'::JSONB))), '{}'),
      NULLIF(v_item->>'media_url', ''),
      COALESCE(v_item->'media_items', '[]'::JSONB),
      NULLIF(v_item->>'call_to_action_link', ''), NULLIF(v_item->>'call_to_action_caption', '')
    ) RETURNING id INTO v_variant_id;

    INSERT INTO social_deliveries (
      variant_id, schedule_platform, scheduled_date, time_slot, scheduled_at,
      status, assigned_to, delivery_method, publication_consented_at, publication_consented_by
    ) VALUES (
      v_variant_id, v_platform,
      p_scheduled_date,
      p_time_slot,
      v_scheduled_at,
      CASE WHEN p_mode = 'scheduled' THEN 'scheduled'::social_delivery_status ELSE 'draft'::social_delivery_status END,
      v_campaign.default_assigned_to, 'automated',
      CASE WHEN p_mode = 'scheduled' THEN NOW() ELSE NULL END,
      CASE WHEN p_mode = 'scheduled' THEN auth.uid() ELSE NULL END
    );
  END LOOP;
  RETURN v_post_id;
END;
$$;

COMMIT;
