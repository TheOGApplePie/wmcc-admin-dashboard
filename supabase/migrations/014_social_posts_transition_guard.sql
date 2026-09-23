-- 014: Protect the legacy social_posts status seam while campaign deliveries roll out.

CREATE OR REPLACE FUNCTION guard_social_post_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;

  IF NEW.status = 'published' AND NOT has_perm('social', 'send') THEN
    RAISE EXCEPTION 'Permission denied: social.send';
  END IF;

  IF (NEW.status = 'scheduled' OR OLD.status = 'scheduled')
     AND NOT has_perm('social', 'schedule') THEN
    RAISE EXCEPTION 'Permission denied: social.schedule';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER social_posts_status_transition_guard
  BEFORE UPDATE OF status ON social_posts
  FOR EACH ROW EXECUTE FUNCTION guard_social_post_status_transition();
