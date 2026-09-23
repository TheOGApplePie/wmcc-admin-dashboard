-- 013: Keep has_perm() in sync with the social scheduling permission matrix.

CREATE OR REPLACE FUNCTION has_perm(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      member_role;
  v_status    member_status;
  v_overrides JSONB;
  v_key       TEXT := p_module || '.' || p_action;
  v_preset    BOOLEAN;
BEGIN
  SELECT role, status, permission_overrides
    INTO v_role, v_status, v_overrides
    FROM profiles
   WHERE id = auth.uid();

  IF NOT FOUND OR v_status <> 'active' THEN RETURN FALSE; END IF;

  v_preset := CASE v_role
    WHEN 'board' THEN TRUE
    WHEN 'management' THEN v_key IN (
      'announcements.view', 'announcements.edit', 'announcements.publish', 'announcements.delete',
      'events.view', 'events.edit', 'events.publish', 'events.delete',
      'social.view', 'social.edit', 'social.schedule', 'social.send', 'social.override', 'social.delete',
      'feedback.view', 'feedback.respond', 'users.view'
    )
    WHEN 'volunteer' THEN v_key IN (
      'announcements.view', 'announcements.edit',
      'events.view', 'events.edit',
      'social.view', 'social.edit',
      'feedback.view'
    )
  END;

  IF v_overrides ? v_key THEN RETURN (v_overrides ->> v_key)::BOOLEAN; END IF;
  RETURN COALESCE(v_preset, FALSE);
END;
$$;
