-- Deterministic permission boundary after 012_role_access_and_audit.sql.
-- Replaces every policy on protected dashboard tables so permissive legacy
-- policies cannot silently broaden access (Postgres combines policies with OR).

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_active_board()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'board'::public.member_role
      AND status = 'active'::public.member_status
  );
$$;

CREATE OR REPLACE FUNCTION private.has_perm(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.member_role;
  v_status public.member_status;
  v_overrides JSONB;
  v_key TEXT := p_module || '.' || p_action;
  v_preset BOOLEAN;
BEGIN
  SELECT role, status, permission_overrides
    INTO v_role, v_status, v_overrides
    FROM public.profiles
   WHERE id = (SELECT auth.uid());

  IF NOT FOUND OR v_status <> 'active'::public.member_status THEN
    RETURN FALSE;
  END IF;

  IF v_key IN ('users.manage', 'users.delete') THEN
    RETURN v_role = 'board'::public.member_role;
  END IF;

  -- A non-view action can never outlive access to its module.
  IF p_action <> 'view'
     AND p_module IN ('announcements', 'events', 'social', 'feedback', 'users')
     AND NOT private.has_perm(p_module, 'view') THEN
    RETURN FALSE;
  END IF;

  v_preset := CASE v_role
    WHEN 'board'::public.member_role THEN TRUE
    WHEN 'management'::public.member_role THEN v_key IN (
      'announcements.view','announcements.edit','announcements.publish','announcements.delete',
      'events.view','events.edit','events.publish','events.delete',
      'social.view','social.edit','social.send','social.delete',
      'feedback.view','feedback.respond','users.view'
    )
    WHEN 'general'::public.member_role THEN v_key IN (
      'announcements.view','announcements.edit','events.view','events.edit',
      'social.view','social.edit','feedback.view'
    )
  END;

  IF v_overrides ? v_key THEN
    RETURN (v_overrides ->> v_key)::BOOLEAN;
  END IF;
  RETURN COALESCE(v_preset, FALSE);
END;
$$;

-- Compatibility wrappers for existing server actions. Internal policies call
-- private functions directly; callers can only evaluate their own JWT identity.
CREATE OR REPLACE FUNCTION public.has_perm(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.has_perm(p_module, p_action) $$;

CREATE OR REPLACE FUNCTION public.is_active_board()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.is_active_board() $$;

REVOKE ALL ON FUNCTION public.has_perm(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_perm(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_board() TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_perm(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_board() TO authenticated;

-- Helper used below to make the final policy set independent of migration history.
CREATE OR REPLACE FUNCTION private.drop_policies(p_schema TEXT, p_table TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_catalog.pg_policies
    WHERE schemaname = p_schema AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', v_policy.policyname, p_schema, p_table);
  END LOOP;
END;
$$;

SELECT private.drop_policies('public', 'profiles');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_permission_overrides_object;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_permission_overrides_object
  CHECK (jsonb_typeof(permission_overrides) = 'object');
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY profiles_board_select ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT private.is_active_board()));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY profiles_board_update ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT private.is_active_board())) WITH CHECK ((SELECT private.is_active_board()));
CREATE POLICY profiles_board_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_active_board()));
CREATE POLICY profiles_board_delete ON public.profiles FOR DELETE TO authenticated
  USING (id <> (SELECT auth.uid()) AND (SELECT private.is_active_board()));
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

SELECT private.drop_policies('public', 'events');
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_public_select ON public.events FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY events_permission_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_perm('events', 'edit')));
CREATE POLICY events_permission_update ON public.events FOR UPDATE TO authenticated
  USING ((SELECT private.has_perm('events', 'edit')))
  WITH CHECK ((SELECT private.has_perm('events', 'edit')));
CREATE POLICY events_permission_delete ON public.events FOR DELETE TO authenticated
  USING ((SELECT private.has_perm('events', 'delete')));
REVOKE INSERT, UPDATE, DELETE ON public.events FROM anon;
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;

SELECT private.drop_policies('public', 'recurrence_rule');
ALTER TABLE public.recurrence_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurrence_public_select ON public.recurrence_rule FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY recurrence_permission_insert ON public.recurrence_rule FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_perm('events', 'edit')));
CREATE POLICY recurrence_permission_update ON public.recurrence_rule FOR UPDATE TO authenticated
  USING ((SELECT private.has_perm('events', 'edit')))
  WITH CHECK ((SELECT private.has_perm('events', 'edit')));
CREATE POLICY recurrence_permission_delete ON public.recurrence_rule FOR DELETE TO authenticated
  USING ((SELECT private.has_perm('events', 'delete')));
REVOKE INSERT, UPDATE, DELETE ON public.recurrence_rule FROM anon;
GRANT SELECT ON public.recurrence_rule TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurrence_rule TO authenticated;

SELECT private.drop_policies('public', 'social_posts');
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_permission_select ON public.social_posts FOR SELECT TO authenticated
  USING ((SELECT private.has_perm('social', 'view')));
CREATE POLICY social_permission_insert ON public.social_posts FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND (SELECT private.has_perm('social', 'edit')));
CREATE POLICY social_permission_update ON public.social_posts FOR UPDATE TO authenticated
  USING ((SELECT private.has_perm('social', 'edit')))
  WITH CHECK ((SELECT private.has_perm('social', 'edit')));
CREATE POLICY social_permission_delete ON public.social_posts FOR DELETE TO authenticated
  USING ((SELECT private.has_perm('social', 'delete')));
REVOKE ALL ON public.social_posts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;

SELECT private.drop_policies('public', 'announcements');
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
-- Announcements power the public website; all columns in this table must remain public-safe.
CREATE POLICY announcements_public_select ON public.announcements FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY announcements_permission_insert ON public.announcements FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_perm('announcements', 'edit')));
CREATE POLICY announcements_permission_update ON public.announcements FOR UPDATE TO authenticated
  USING ((SELECT private.has_perm('announcements', 'edit')))
  WITH CHECK ((SELECT private.has_perm('announcements', 'edit')));
CREATE POLICY announcements_permission_delete ON public.announcements FOR DELETE TO authenticated
  USING ((SELECT private.has_perm('announcements', 'delete')));
REVOKE INSERT, UPDATE, DELETE ON public.announcements FROM anon;
GRANT SELECT ON public.announcements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

SELECT private.drop_policies('public', 'community-feedback');
ALTER TABLE public."community-feedback" ENABLE ROW LEVEL SECURITY;
-- Public submission is intentional; submitted rows are never public-readable.
CREATE POLICY feedback_public_insert ON public."community-feedback" FOR INSERT TO anon, authenticated
  WITH CHECK (TRUE);
CREATE POLICY feedback_permission_select ON public."community-feedback" FOR SELECT TO authenticated
  USING ((SELECT private.has_perm('feedback', 'view')));
REVOKE SELECT, UPDATE, DELETE ON public."community-feedback" FROM anon;
GRANT INSERT ON public."community-feedback" TO anon;
GRANT SELECT, INSERT ON public."community-feedback" TO authenticated;

DROP FUNCTION private.drop_policies(TEXT, TEXT);

COMMIT;
