-- Role-based access hardening and append-only activity history.

-- Audit targets include UUID-backed records (for example social_posts and profiles).
ALTER TABLE public.audit_logs ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Board can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'board' AND status = 'active'
    )
  );
CREATE POLICY "Active members can append audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'active')
  );

-- Access administration is Board-only and cannot be delegated by overrides.
CREATE OR REPLACE FUNCTION is_active_board()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'board' AND status = 'active'
  );
$$;

-- Even malformed/legacy override JSON cannot delegate access administration.
CREATE OR REPLACE FUNCTION has_perm(p_module TEXT, p_action TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  IF v_key IN ('users.manage', 'users.delete') THEN RETURN v_role = 'board'; END IF;

  v_preset := CASE v_role
    WHEN 'board' THEN TRUE
    WHEN 'management' THEN v_key IN (
      'announcements.view','announcements.edit','announcements.publish','announcements.delete',
      'events.view','events.edit','events.publish','events.delete',
      'social.view','social.edit','social.send','social.delete',
      'feedback.view','feedback.respond','users.view'
    )
    WHEN 'general' THEN v_key IN (
      'announcements.view','announcements.edit','events.view','events.edit',
      'social.view','social.edit','feedback.view'
    )
  END;
  IF v_overrides ? v_key THEN RETURN (v_overrides ->> v_key)::BOOLEAN; END IF;
  RETURN COALESCE(v_preset, FALSE);
END;
$$;

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (is_active_board());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR is_active_board())
  WITH CHECK (id = auth.uid() OR is_active_board());
CREATE POLICY profiles_delete ON public.profiles FOR DELETE
  USING (id <> auth.uid() AND is_active_board());

-- Content tables: retain public reads where the public site needs them, while
-- dashboard mutations use the effective permission matrix.
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.events;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.events;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.events;
CREATE POLICY events_permission_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (has_perm('events', 'edit'));
CREATE POLICY events_permission_update ON public.events FOR UPDATE TO authenticated
  USING (has_perm('events', 'edit')) WITH CHECK (has_perm('events', 'edit'));
CREATE POLICY events_permission_delete ON public.events FOR DELETE TO authenticated
  USING (has_perm('events', 'delete'));

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.recurrence_rule;
CREATE POLICY recurrence_permission_insert ON public.recurrence_rule FOR INSERT TO authenticated
  WITH CHECK (has_perm('events', 'edit'));
CREATE POLICY recurrence_permission_update ON public.recurrence_rule FOR UPDATE TO authenticated
  USING (has_perm('events', 'edit')) WITH CHECK (has_perm('events', 'edit'));
CREATE POLICY recurrence_permission_delete ON public.recurrence_rule FOR DELETE TO authenticated
  USING (has_perm('events', 'delete'));

DROP POLICY IF EXISTS "Admins can create social posts" ON public.social_posts;
DROP POLICY IF EXISTS "Admins can update any social post" ON public.social_posts;
DROP POLICY IF EXISTS "Admins can delete any social post" ON public.social_posts;
CREATE POLICY social_permission_insert ON public.social_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND has_perm('social', 'edit'));
CREATE POLICY social_permission_update ON public.social_posts FOR UPDATE TO authenticated
  USING (has_perm('social', 'edit')) WITH CHECK (has_perm('social', 'edit'));
CREATE POLICY social_permission_delete ON public.social_posts FOR DELETE TO authenticated
  USING (has_perm('social', 'delete'));

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_permission_select ON public.announcements;
DROP POLICY IF EXISTS announcements_permission_insert ON public.announcements;
DROP POLICY IF EXISTS announcements_permission_update ON public.announcements;
DROP POLICY IF EXISTS announcements_permission_delete ON public.announcements;
CREATE POLICY announcements_permission_select ON public.announcements FOR SELECT TO authenticated
  USING (has_perm('announcements', 'view'));
CREATE POLICY announcements_permission_insert ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (has_perm('announcements', 'edit'));
CREATE POLICY announcements_permission_update ON public.announcements FOR UPDATE TO authenticated
  USING (has_perm('announcements', 'edit')) WITH CHECK (has_perm('announcements', 'edit'));
CREATE POLICY announcements_permission_delete ON public.announcements FOR DELETE TO authenticated
  USING (has_perm('announcements', 'delete'));

ALTER TABLE public."community-feedback" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_permission_select ON public."community-feedback";
CREATE POLICY feedback_permission_select ON public."community-feedback" FOR SELECT TO authenticated
  USING (has_perm('feedback', 'view'));

-- TODO(tests-pr): add role preset, override, inactive-account, self-demotion,
-- direct server-action, RLS, and audit-log coverage in the dedicated test PR.
