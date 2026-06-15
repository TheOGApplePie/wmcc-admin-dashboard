-- ─── Team / User Management — Phase 1 ────────────────────────────────────────
--
-- Creates the profiles table that backs the Team module: who has access to the
-- dashboard and exactly what each person can do.
--
-- Permission model: three role presets (board / management / volunteer) over a
-- per-module action matrix, with per-user JSONB overrides applied on top.
-- The preset definition lives in features/team/permissions.ts (client + server)
-- and is mirrored here inside has_perm() — keep the two in sync.
--
-- Storage: create a bucket named 'avatars' in the Supabase dashboard
--   Settings → Storage → New bucket
--   Public: true
--   Allowed MIME types: image/jpeg, image/png
--   Max upload size: 5 MB

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE member_role   AS ENUM ('board', 'management', 'volunteer');
CREATE TYPE member_status AS ENUM ('invited', 'active', 'inactive');

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id                   UUID          PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name         TEXT          NOT NULL,
  email                TEXT          NOT NULL,
  avatar_path          TEXT,                                  -- Supabase Storage key in 'avatars'
  role                 member_role   NOT NULL DEFAULT 'volunteer',
  status               member_status NOT NULL DEFAULT 'invited',
  area                 TEXT,                                  -- soft label, e.g. "Social Media"
  permission_overrides JSONB         NOT NULL DEFAULT '{}',   -- {"social.send": true, ...}
  notification_prefs   JSONB         NOT NULL DEFAULT '{}',   -- {"email_on_feedback": true, ...}
  last_active_at       TIMESTAMPTZ,
  invited_by           UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX ON profiles (status);
CREATE INDEX ON profiles (role) WHERE status = 'active';

-- ── has_perm(): the real permission boundary ─────────────────────────────────
--
-- Resolves the calling user's effective permission for "<module>.<action>":
-- role preset, then permission_overrides applied on top. Inactive and invited
-- members have no permissions.
--
-- SECURITY DEFINER so RLS policies on profiles itself can call it without
-- recursing into the profiles policies.

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

  IF NOT FOUND OR v_status <> 'active' THEN
    RETURN FALSE;
  END IF;

  -- Role presets — mirror features/team/permissions.ts exactly.
  v_preset := CASE v_role
    WHEN 'board' THEN TRUE
    WHEN 'management' THEN v_key IN (
      'announcements.view', 'announcements.edit', 'announcements.publish', 'announcements.delete',
      'events.view', 'events.edit', 'events.publish', 'events.delete',
      'social.view', 'social.edit', 'social.send', 'social.delete',
      'feedback.view', 'feedback.respond',
      'users.view'
    )
    WHEN 'volunteer' THEN v_key IN (
      'announcements.view', 'announcements.edit',
      'events.view', 'events.edit',
      'social.view', 'social.edit',
      'feedback.view'
    )
  END;

  IF v_overrides ? v_key THEN
    RETURN (v_overrides ->> v_key)::BOOLEAN;
  END IF;

  RETURN COALESCE(v_preset, FALSE);
END;
$$;

-- ── Guard triggers ────────────────────────────────────────────────────────────
--
-- Enforced in Postgres so they hold even if a server action forgets to check.
-- Service-role connections have auth.uid() = NULL, so the self-edit guard does
-- not block administrative server actions; the last-Board guard always applies.

-- 1) Last-Board guard: never allow the org to end up with zero active board members.
CREATE OR REPLACE FUNCTION guard_last_board()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining INT;
BEGIN
  IF OLD.role = 'board' AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'board' OR NEW.status <> 'active') THEN
    SELECT COUNT(*) INTO v_remaining
      FROM profiles
     WHERE role = 'board' AND status = 'active' AND id <> OLD.id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last active Board member.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_guard_last_board
  BEFORE UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_last_board();

-- 2) Self-edit guard: a user cannot change their own role, status, or overrides.
--    Exception: the invited → active transition (first sign-in) is allowed.
CREATE OR REPLACE FUNCTION guard_self_access_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id = auth.uid() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.permission_overrides IS DISTINCT FROM OLD.permission_overrides THEN
      RAISE EXCEPTION 'You can''t change your own access.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'invited' AND NEW.status = 'active') THEN
      RAISE EXCEPTION 'You can''t change your own status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_self_access
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_self_access_change();

-- 3) Stamp joined_at when an invite is accepted.
CREATE OR REPLACE FUNCTION stamp_joined_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'invited' AND NEW.status = 'active' AND NEW.joined_at IS NULL THEN
    NEW.joined_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stamp_joined_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION stamp_joined_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read their own profile; the roster needs users.view.
CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (id = auth.uid() OR has_perm('users', 'view'));

-- Creating members (invite flow) needs users.manage.
CREATE POLICY profiles_insert ON profiles
  FOR INSERT WITH CHECK (has_perm('users', 'manage'));

-- Members can update their own row (self-service profile; the trigger above
-- blocks role/status/override changes); managing others needs users.manage.
CREATE POLICY profiles_update ON profiles
  FOR UPDATE
  USING (id = auth.uid() OR has_perm('users', 'manage'))
  WITH CHECK (id = auth.uid() OR has_perm('users', 'manage'));

-- Hard delete needs users.delete and is never self-service.
CREATE POLICY profiles_delete ON profiles
  FOR DELETE USING (id <> auth.uid() AND has_perm('users', 'delete'));

-- ── Enforcing has_perm() across the other modules ─────────────────────────────
--
-- APPLY SEPARATELY, after verifying every existing admin has a profiles row —
-- enabling RLS on a table without a matching policy locks everyone out.
-- These mirror the sensitive actions in the permission matrix:
--
--   ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY ann_select ON announcements FOR SELECT USING (has_perm('announcements','view'));
--   CREATE POLICY ann_insert ON announcements FOR INSERT WITH CHECK (has_perm('announcements','edit'));
--   CREATE POLICY ann_update ON announcements FOR UPDATE USING (has_perm('announcements','edit'));
--   CREATE POLICY ann_delete ON announcements FOR DELETE USING (has_perm('announcements','delete'));
--
--   ALTER TABLE events ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY ev_select ON events FOR SELECT USING (has_perm('events','view'));
--   CREATE POLICY ev_insert ON events FOR INSERT WITH CHECK (has_perm('events','edit'));
--   CREATE POLICY ev_update ON events FOR UPDATE USING (has_perm('events','edit'));
--   CREATE POLICY ev_delete ON events FOR DELETE USING (has_perm('events','delete'));
--
--   ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY sp_select ON social_posts FOR SELECT USING (has_perm('social','view'));
--   CREATE POLICY sp_insert ON social_posts FOR INSERT WITH CHECK (has_perm('social','edit'));
--   CREATE POLICY sp_update ON social_posts FOR UPDATE USING (has_perm('social','edit'));
--   CREATE POLICY sp_delete ON social_posts FOR DELETE USING (has_perm('social','delete'));
--   -- The send/broadcast path must additionally call has_perm('social','send')
--   -- in the server action before dispatching (it is an action, not a row op).
--
--   ALTER TABLE "community-feedback" ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY cf_select ON "community-feedback" FOR SELECT USING (has_perm('feedback','view'));
--   -- Feedback is never archived or deleted: no UPDATE/DELETE policies on rows;
--   -- responding is guarded by has_perm('feedback','respond') in the action.
