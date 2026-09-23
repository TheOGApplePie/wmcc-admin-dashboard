-- 025: Return the current viewer's effective permission state for the Redux UI cache.
-- Authorization remains enforced by has_perm(), server actions, and RLS.

-- Older installations created the third role as `volunteer`; the current
-- application and permission matrix call it `general`. Normalize fresh and
-- partially-upgraded databases without disturbing environments already fixed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_enum enum_value
      JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
     WHERE enum_type.typname = 'member_role'
       AND enum_value.enumlabel = 'volunteer'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_enum enum_value
      JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
     WHERE enum_type.typname = 'member_role'
       AND enum_value.enumlabel = 'general'
  ) THEN
    ALTER TYPE member_role RENAME VALUE 'volunteer' TO 'general';
  END IF;
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
    ('social.schedule', 'social', 'schedule'),
    ('social.send', 'social', 'send'),
    ('social.review', 'social', 'review'),
    ('social.override', 'social', 'override'),
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

-- A member with users.delete may deactivate another member, but must not be
-- able to smuggle role/profile/override changes through the same UPDATE.
CREATE OR REPLACE FUNCTION guard_profile_permission_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR NEW.id = auth.uid() OR has_perm('users', 'manage') THEN
    RETURN NEW;
  END IF;
  IF has_perm('users', 'delete')
     AND OLD.status IS DISTINCT FROM 'inactive'::member_status
     AND NEW.status = 'inactive'::member_status
     AND (to_jsonb(NEW) - 'status' - 'updated_at')
         IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Permission denied: users.manage';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_permission_update ON profiles;
CREATE TRIGGER trg_guard_profile_permission_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_permission_update();

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles
  FOR UPDATE
  USING (
    id = auth.uid()
    OR has_perm('users', 'manage')
    OR has_perm('users', 'delete')
  )
  WITH CHECK (
    id = auth.uid()
    OR has_perm('users', 'manage')
    OR has_perm('users', 'delete')
  );

-- Replace broad authenticated-write policies with the same effective
-- permissions exposed to Redux. Public-site reads and feedback submission
-- remain available, while dashboard mutations require explicit permission.
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = ANY (ARRAY[
         'events', 'recurrence_rule', 'announcements', 'community-feedback'
       ])
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  END LOOP;
END;
$$;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_public_select ON events
  FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY events_permission_insert ON events
  FOR INSERT TO authenticated WITH CHECK (has_perm('events', 'edit'));
CREATE POLICY events_permission_update ON events
  FOR UPDATE TO authenticated
  USING (has_perm('events', 'edit'))
  WITH CHECK (has_perm('events', 'edit'));
CREATE POLICY events_permission_delete ON events
  FOR DELETE TO authenticated USING (has_perm('events', 'delete'));

REVOKE ALL ON events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON events TO authenticated;

ALTER TABLE recurrence_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurrence_public_select ON recurrence_rule
  FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY recurrence_permission_insert ON recurrence_rule
  FOR INSERT TO authenticated WITH CHECK (has_perm('events', 'edit'));
CREATE POLICY recurrence_permission_update ON recurrence_rule
  FOR UPDATE TO authenticated
  USING (has_perm('events', 'edit') OR has_perm('events', 'delete'))
  WITH CHECK (has_perm('events', 'edit') OR has_perm('events', 'delete'));
CREATE POLICY recurrence_permission_delete ON recurrence_rule
  FOR DELETE TO authenticated USING (has_perm('events', 'delete'));

REVOKE ALL ON recurrence_rule FROM PUBLIC, anon, authenticated;
GRANT SELECT ON recurrence_rule TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON recurrence_rule TO authenticated;

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcements_public_select ON announcements
  FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY announcements_permission_insert ON announcements
  FOR INSERT TO authenticated WITH CHECK (has_perm('announcements', 'edit'));
CREATE POLICY announcements_permission_update ON announcements
  FOR UPDATE TO authenticated
  USING (has_perm('announcements', 'edit'))
  WITH CHECK (has_perm('announcements', 'edit'));
CREATE POLICY announcements_permission_delete ON announcements
  FOR DELETE TO authenticated USING (has_perm('announcements', 'delete'));

REVOKE ALL ON announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON announcements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON announcements TO authenticated;

ALTER TABLE "community-feedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_public_insert ON "community-feedback"
  FOR INSERT TO anon, authenticated WITH CHECK (TRUE);
CREATE POLICY feedback_permission_select ON "community-feedback"
  FOR SELECT TO authenticated USING (has_perm('feedback', 'view'));

REVOKE ALL ON "community-feedback" FROM PUBLIC, anon, authenticated;
GRANT INSERT ON "community-feedback" TO anon, authenticated;
GRANT SELECT ON "community-feedback" TO authenticated;

-- Event deletion must be able to pause and flag its linked campaign even when
-- the event editor does not separately hold social.edit. The trigger can only
-- run as a consequence of an events.delete-authorized row deletion.
ALTER FUNCTION preserve_social_campaigns_before_event_delete() SECURITY DEFINER;
ALTER FUNCTION preserve_social_campaigns_before_event_delete() SET search_path = public;
