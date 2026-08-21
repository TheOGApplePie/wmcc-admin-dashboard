-- Narrow, caller-scoped DTO functions for the Next.js data-access layer.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_permissions JSONB;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('profile', NULL, 'permissions', '{}'::JSONB);
  END IF;

  SELECT COALESCE(jsonb_object_agg(permission_key, private.has_perm(module_key, action_key)), '{}'::JSONB)
    INTO v_permissions
    FROM (VALUES
      ('announcements.view','announcements','view'),
      ('announcements.edit','announcements','edit'),
      ('announcements.publish','announcements','publish'),
      ('announcements.delete','announcements','delete'),
      ('events.view','events','view'), ('events.edit','events','edit'),
      ('events.publish','events','publish'), ('events.delete','events','delete'),
      ('social.view','social','view'), ('social.edit','social','edit'),
      ('social.send','social','send'), ('social.delete','social','delete'),
      ('feedback.view','feedback','view'), ('feedback.respond','feedback','respond'),
      ('users.view','users','view'), ('users.manage','users','manage'),
      ('users.delete','users','delete'), ('integrations.manage','integrations','manage')
    ) AS permission_list(permission_key, module_key, action_key);

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'displayName', v_profile.display_name,
      'role', v_profile.role,
      'status', v_profile.status
    ),
    'permissions', CASE WHEN v_profile.status = 'active'::public.member_status
      THEN v_permissions ELSE '{}'::JSONB END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_roster()
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_path TEXT,
  role public.member_role,
  status public.member_status,
  area TEXT,
  last_active_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_perm('users', 'view') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_path, p.role, p.status, p.area,
         p.last_active_at, p.joined_at, p.created_at
  FROM public.profiles p
  ORDER BY p.role, p.display_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_assignees()
RETURNS TABLE (id UUID, display_name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_perm('social', 'edit') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.status = 'active'::public.member_status
  ORDER BY p.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_team_roster() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_social_assignees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_roster() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_assignees() TO authenticated;

COMMIT;
