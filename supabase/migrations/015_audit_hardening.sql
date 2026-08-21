-- Immutable, database-driven activity history for protected mutations.

BEGIN;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS changed_fields TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

DO $$
DECLARE v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.audit_logs', v_policy.policyname);
  END LOOP;
END $$;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_board_select ON public.audit_logs FOR SELECT TO authenticated
  USING ((SELECT private.is_active_board()));

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION private.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_row JSONB := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  v_changed TEXT[] := '{}';
BEGIN
  -- Service-role/maintenance work has no user JWT. Those workflows must emit a
  -- narrowly validated manual record when a human actor initiated the change.
  IF v_actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(new_value.key ORDER BY new_value.key), '{}')
      INTO v_changed
      FROM jsonb_each(to_jsonb(NEW)) AS new_value
      JOIN jsonb_each(to_jsonb(OLD)) AS old_value USING (key)
     WHERE new_value.value IS DISTINCT FROM old_value.value;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_email, entity_type, entity_id, action, changed_fields, metadata
  ) VALUES (
    v_actor,
    (SELECT auth.jwt() ->> 'email'),
    TG_ARGV[0],
    COALESCE(v_row ->> 'id', 'unknown'),
    lower(TG_OP),
    v_changed,
    jsonb_build_object('table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_profile_activity(
  p_profile_id UUID,
  p_action TEXT,
  p_detail TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_board() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('invite', 'resend_invite') THEN
    RAISE EXCEPTION 'unsupported profile activity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_email, entity_type, entity_id, action, detail, metadata
  ) VALUES (
    (SELECT auth.uid()),
    (SELECT auth.jwt() ->> 'email'),
    'profile', p_profile_id::TEXT, p_action, p_detail,
    jsonb_build_object('source', 'profile_workflow')
  );
END;
$$;

REVOKE ALL ON FUNCTION private.audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_profile_activity(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_profile_activity(UUID, TEXT, TEXT) TO authenticated;

DROP TRIGGER IF EXISTS audit_events ON public.events;
CREATE TRIGGER audit_events AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change('event');
DROP TRIGGER IF EXISTS audit_recurrence_rule ON public.recurrence_rule;
CREATE TRIGGER audit_recurrence_rule AFTER INSERT OR UPDATE OR DELETE ON public.recurrence_rule
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change('recurrence_rule');
DROP TRIGGER IF EXISTS audit_announcements ON public.announcements;
CREATE TRIGGER audit_announcements AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change('announcement');
DROP TRIGGER IF EXISTS audit_social_posts ON public.social_posts;
CREATE TRIGGER audit_social_posts AFTER INSERT OR UPDATE OR DELETE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change('social_post');
DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;
CREATE TRIGGER audit_profiles AFTER UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.audit_row_change('profile');

COMMIT;
