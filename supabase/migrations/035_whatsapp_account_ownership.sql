CREATE TABLE whatsapp_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_jid text NOT NULL UNIQUE CHECK (whatsapp_jid ~ '^[0-9]+@s[.]whatsapp[.]net$'),
  paired_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON whatsapp_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON whatsapp_accounts TO authenticated;
CREATE POLICY whatsapp_account_self ON whatsapp_accounts FOR SELECT TO authenticated
  USING (user_id=auth.uid());

CREATE FUNCTION claim_whatsapp_account(whatsapp_jid text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing_jid text; owner_id uuid; caller uuid:=auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF whatsapp_jid IS NULL OR whatsapp_jid !~ '^[0-9]+@s[.]whatsapp[.]net$' THEN RAISE EXCEPTION 'Invalid normalized WhatsApp JID.'; END IF;
  SELECT a.whatsapp_jid INTO existing_jid FROM whatsapp_accounts a WHERE a.user_id=caller;
  IF existing_jid=whatsapp_jid THEN RETURN 'already_claimed_by_you'; END IF;
  IF existing_jid IS NOT NULL THEN RETURN 'user_has_other_account'; END IF;
  IF NOT has_perm('social','publish') THEN RAISE EXCEPTION 'Permission denied: social.publish'; END IF;
  INSERT INTO whatsapp_accounts(user_id,whatsapp_jid)
    VALUES(caller,whatsapp_jid) ON CONFLICT DO NOTHING;
  IF FOUND THEN RETURN 'claimed'; END IF;
  SELECT a.whatsapp_jid INTO existing_jid FROM whatsapp_accounts a WHERE a.user_id=caller;
  IF existing_jid=whatsapp_jid THEN RETURN 'already_claimed_by_you'; END IF;
  IF existing_jid IS NOT NULL THEN RETURN 'user_has_other_account'; END IF;
  SELECT a.user_id INTO owner_id FROM whatsapp_accounts a WHERE a.whatsapp_jid=claim_whatsapp_account.whatsapp_jid;
  IF owner_id IS NOT NULL THEN RETURN 'account_claimed'; END IF;
  RAISE EXCEPTION 'Ownership changed. Retry pairing.';
END $$;

CREATE FUNCTION release_whatsapp_account() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  DELETE FROM whatsapp_accounts WHERE user_id=auth.uid();
  IF FOUND THEN RETURN 'released'; END IF;
  RETURN 'not_found';
END $$;
REVOKE ALL ON FUNCTION claim_whatsapp_account(text),release_whatsapp_account() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION claim_whatsapp_account(text),release_whatsapp_account() TO authenticated;
