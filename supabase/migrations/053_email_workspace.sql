-- Independent email staging; no provider or dispatch.
BEGIN;
CREATE OR REPLACE FUNCTION has_permission_for_user(p_user_id uuid, p_module TEXT, p_action TEXT)
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
    FROM profiles WHERE id = p_user_id;
  IF NOT FOUND OR v_status <> 'active' THEN RETURN FALSE; END IF;
  IF v_role::TEXT = 'board' THEN RETURN TRUE; END IF;
  v_preset := CASE v_role::TEXT
    WHEN 'management' THEN v_key IN (
      'announcements.view', 'announcements.edit', 'announcements.publish', 'announcements.delete',
      'events.view', 'events.edit', 'events.publish', 'events.delete',
      'social.view', 'social.edit', 'social.publish', 'social.delete',
      'email.view', 'email.edit', 'email.approve',
      'feedback.view', 'feedback.respond', 'users.view'
    )
    WHEN 'general' THEN v_key IN (
      'announcements.view', 'announcements.edit', 'events.view', 'events.edit',
      'social.view', 'social.edit', 'email.view', 'email.edit', 'feedback.view'
    )
    ELSE FALSE
  END;
  IF v_overrides ? v_key THEN RETURN (v_overrides ->> v_key)::BOOLEAN; END IF;
  RETURN COALESCE(v_preset, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION has_permission_for_user(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION has_permission_for_user(uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION has_perm(p_module text,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT has_permission_for_user(auth.uid(),p_module,p_action)
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
    ('email.view', 'email', 'view'),
    ('email.edit', 'email', 'edit'),
    ('email.approve', 'email', 'approve'),
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


CREATE TABLE public.email_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.email_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 body text NOT NULL DEFAULT '' CHECK(length(body)<=30000), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.email_communications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120), subject text NOT NULL DEFAULT '' CHECK(length(subject)<=200),
 preheader text NOT NULL DEFAULT '' CHECK(length(preheader)<=200), sender text NOT NULL DEFAULT '' CHECK(length(sender)<=254),
 audience text NOT NULL DEFAULT '' CHECK(length(audience)<=200), trigger_kind text NOT NULL DEFAULT 'manual' CHECK(trigger_kind IN ('manual','registration','relative_to_event')),
 offset_days integer CHECK(offset_days BETWEEN -365 AND 365), body text NOT NULL DEFAULT '' CHECK(length(body)<=30000),
 review_state text NOT NULL DEFAULT 'draft' CHECK(review_state IN ('draft','pending','approved')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), approved_by uuid, approved_at timestamptz,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_campaigns_created_idx ON public.email_campaigns(created_at DESC,id DESC);
CREATE INDEX email_communications_campaign_idx ON public.email_communications(campaign_id,created_at,id);
CREATE INDEX email_templates_created_idx ON public.email_templates(created_at DESC,id DESC);
CREATE TABLE public.email_communication_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, communication_id uuid NOT NULL,
 revision integer NOT NULL, snapshot jsonb NOT NULL, actor uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_history_communication_idx ON public.email_communication_history(communication_id,revision DESC);
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_communication_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_campaigns,public.email_templates,public.email_communications,public.email_communication_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.email_campaigns,public.email_templates,public.email_communications,public.email_communication_history TO authenticated;
CREATE POLICY email_campaigns_read ON public.email_campaigns FOR SELECT TO authenticated USING(public.has_perm('email','view'));
CREATE POLICY email_templates_read ON public.email_templates FOR SELECT TO authenticated USING(public.has_perm('email','view'));
CREATE POLICY email_communications_read ON public.email_communications FOR SELECT TO authenticated USING(public.has_perm('email','view'));
CREATE POLICY email_history_read ON public.email_communication_history FOR SELECT TO authenticated USING(public.has_perm('email','view'));

CREATE FUNCTION public.create_email_campaign(p_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; BEGIN
 IF NOT public.has_perm('email','edit') THEN RAISE EXCEPTION 'Permission denied: email.edit' USING ERRCODE='42501'; END IF;
 INSERT INTO public.email_campaigns(name,created_by) VALUES(btrim(p_name),auth.uid()) RETURNING id INTO result; RETURN result;
END $$;
CREATE FUNCTION public.create_email_template(p_name text,p_body text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; BEGIN
 IF NOT public.has_perm('email','edit') THEN RAISE EXCEPTION 'Permission denied: email.edit' USING ERRCODE='42501'; END IF;
 INSERT INTO public.email_templates(name,body,created_by) VALUES(btrim(p_name),p_body,auth.uid()) RETURNING id INTO result; RETURN result;
END $$;
CREATE FUNCTION public.create_email_communication(p_campaign_id uuid,p_title text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; BEGIN
 IF NOT public.has_perm('email','edit') THEN RAISE EXCEPTION 'Permission denied: email.edit' USING ERRCODE='42501'; END IF;
 INSERT INTO public.email_communications(campaign_id,title,created_by) VALUES(p_campaign_id,btrim(p_title),auth.uid()) RETURNING id INTO result; RETURN result;
END $$;
CREATE FUNCTION public.save_email_communication(p_id uuid,p_revision integer,p_title text,p_subject text,p_preheader text,p_sender text,p_audience text,p_trigger_kind text,p_offset_days integer,p_body text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_row public.email_communications%ROWTYPE; new_revision integer; BEGIN
 IF NOT public.has_perm('email','edit') THEN RAISE EXCEPTION 'Permission denied: email.edit' USING ERRCODE='42501'; END IF;
 SELECT * INTO old_row FROM public.email_communications WHERE id=p_id FOR UPDATE;
 IF old_row.id IS NULL OR old_row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Communication changed. Reload before saving.' USING ERRCODE='40001'; END IF;
 IF ROW(old_row.title,old_row.subject,old_row.preheader,old_row.sender,old_row.audience,old_row.trigger_kind,old_row.offset_days,old_row.body)
  IS NOT DISTINCT FROM ROW(btrim(p_title),p_subject,p_preheader,p_sender,p_audience,p_trigger_kind,p_offset_days,p_body) THEN RETURN old_row.revision; END IF;
 INSERT INTO public.email_communication_history(communication_id,revision,snapshot,actor) VALUES(old_row.id,old_row.revision,to_jsonb(old_row),auth.uid());
 UPDATE public.email_communications SET title=btrim(p_title),subject=p_subject,preheader=p_preheader,sender=p_sender,audience=p_audience,
  trigger_kind=p_trigger_kind,offset_days=p_offset_days,body=p_body,review_state='draft',approved_by=NULL,approved_at=NULL,revision=revision+1,updated_at=now()
  WHERE id=p_id RETURNING revision INTO new_revision; RETURN new_revision;
END $$;
CREATE FUNCTION public.transition_email_communication(p_id uuid,p_revision integer,p_action text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_row public.email_communications%ROWTYPE; new_state text; new_revision integer; BEGIN
 IF p_action IS NULL OR p_action NOT IN ('submit','approve','reject') THEN RAISE EXCEPTION 'Invalid review action.' USING ERRCODE='22023'; END IF;
 IF NOT public.has_perm('email',CASE WHEN p_action='submit' THEN 'edit' ELSE 'approve' END) THEN RAISE EXCEPTION 'Permission denied.' USING ERRCODE='42501'; END IF;
 SELECT * INTO old_row FROM public.email_communications WHERE id=p_id FOR UPDATE;
 IF old_row.id IS NULL OR old_row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Communication changed. Reload before continuing.' USING ERRCODE='40001'; END IF;
 IF (p_action='submit' AND old_row.review_state<>'draft') OR (p_action IN ('approve','reject') AND old_row.review_state<>'pending') THEN RAISE EXCEPTION 'Invalid review state.' USING ERRCODE='22023'; END IF;
 IF p_action='submit' AND (btrim(old_row.subject)='' OR btrim(old_row.sender)='' OR old_row.sender !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR btrim(old_row.audience)='' OR btrim(old_row.body)='' OR (old_row.trigger_kind='relative_to_event' AND old_row.offset_days IS NULL)) THEN
   RAISE EXCEPTION 'Add a subject, sender, audience, content and any required timing before review.' USING ERRCODE='22023'; END IF;
 new_state:=CASE p_action WHEN 'submit' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'draft' END;
 INSERT INTO public.email_communication_history(communication_id,revision,snapshot,actor) VALUES(old_row.id,old_row.revision,to_jsonb(old_row),auth.uid());
 UPDATE public.email_communications SET review_state=new_state,approved_by=CASE WHEN p_action='approve' THEN auth.uid() END,
  approved_at=CASE WHEN p_action='approve' THEN now() END,revision=revision+1,updated_at=now() WHERE id=p_id RETURNING revision INTO new_revision; RETURN new_revision;
END $$;
REVOKE ALL ON FUNCTION public.create_email_campaign(text),public.create_email_template(text,text),public.create_email_communication(uuid,text),public.save_email_communication(uuid,integer,text,text,text,text,text,text,integer,text),public.transition_email_communication(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_email_campaign(text),public.create_email_template(text,text),public.create_email_communication(uuid,text),public.save_email_communication(uuid,integer,text,text,text,text,text,text,integer,text),public.transition_email_communication(uuid,integer,text) TO authenticated;
COMMIT;
