-- 019: Transactional creation of supplemental manual campaign posts.

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
  IF p_mode = 'scheduled' AND NOT has_perm('social', 'schedule') THEN RAISE EXCEPTION 'Permission denied: social.schedule'; END IF;

  SELECT * INTO v_campaign FROM social_campaigns WHERE id = p_campaign_id AND status <> 'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found.'; END IF;

  v_scheduled_at := CASE WHEN p_mode = 'scheduled' THEN
    (p_scheduled_date::TEXT || CASE p_time_slot WHEN 'morning' THEN ' 09:00:00' WHEN 'afternoon' THEN ' 14:00:00' ELSE ' 19:00:00' END)::TIMESTAMP AT TIME ZONE 'America/Toronto'
    ELSE NULL END;

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
    v_scheduled_at, NULL, v_campaign.event_id, auth.uid(), 'GENERAL', p_time_slot, '{}',
    v_campaign.default_assigned_to, p_campaign_id, v_occurrence_id
  ) RETURNING id INTO v_post_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_variants, '[]'::JSONB)) LOOP
    v_channel := (v_item->>'channel')::social_variant_channel;
    v_platform := CASE WHEN v_channel LIKE 'instagram_%' THEN 'instagram'::social_schedule_platform WHEN v_channel = 'whatsapp' THEN 'whatsapp'::social_schedule_platform ELSE 'tiktok'::social_schedule_platform END;
    IF p_mode = 'scheduled' AND EXISTS (
      SELECT 1 FROM social_deliveries
       WHERE schedule_platform = v_platform AND scheduled_date = p_scheduled_date
         AND time_slot = p_time_slot AND status <> 'cancelled'
    ) THEN RAISE EXCEPTION 'The % slot is already occupied.', v_platform; END IF;

    INSERT INTO social_post_variants (
      post_id, channel, caption, description, hashtags, media_url,
      call_to_action_link, call_to_action_caption
    ) VALUES (
      v_post_id, v_channel, COALESCE(v_item->>'caption', ''), COALESCE(p_description, ''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_item->'hashtags')), '{}'),
      NULLIF(v_item->>'media_url', ''), NULLIF(v_item->>'call_to_action_link', ''),
      NULLIF(v_item->>'call_to_action_caption', '')
    ) RETURNING id INTO v_variant_id;

    INSERT INTO social_deliveries (
      variant_id, schedule_platform, scheduled_date, time_slot, scheduled_at,
      status, assigned_to, delivery_method
    ) VALUES (
      v_variant_id, v_platform,
      CASE WHEN p_mode = 'scheduled' THEN p_scheduled_date ELSE NULL END,
      CASE WHEN p_mode = 'scheduled' THEN p_time_slot ELSE NULL END,
      v_scheduled_at,
      CASE WHEN p_mode = 'scheduled' THEN 'scheduled'::social_delivery_status ELSE 'draft'::social_delivery_status END,
      v_campaign.default_assigned_to, 'manual'
    );
  END LOOP;
  RETURN v_post_id;
END;
$$;

REVOKE ALL ON FUNCTION create_manual_social_post(UUID, TEXT, TEXT, DATE, time_slot, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_manual_social_post(UUID, TEXT, TEXT, DATE, time_slot, TEXT, JSONB) TO authenticated;
