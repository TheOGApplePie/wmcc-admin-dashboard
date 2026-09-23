-- 018: Allow explicitly-authorized CMS deletion of any social delivery.
-- This never calls an external platform API or removes externally published content.

CREATE OR REPLACE FUNCTION guard_sent_social_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('sent', 'skipped') AND NOT has_perm('social', 'delete') THEN
      RAISE EXCEPTION 'Permission denied: social.delete';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('sent', 'skipped') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Sent or skipped social deliveries are immutable.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION delete_social_delivery_post(p_delivery_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_id UUID;
  v_post_id UUID;
BEGIN
  IF NOT has_perm('social', 'delete') THEN
    RAISE EXCEPTION 'Permission denied: social.delete';
  END IF;

  SELECT delivery.variant_id, variant.post_id
    INTO v_variant_id, v_post_id
    FROM social_deliveries AS delivery
    JOIN social_post_variants AS variant ON variant.id = delivery.variant_id
   WHERE delivery.id = p_delivery_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Social post delivery not found.'; END IF;

  DELETE FROM social_deliveries WHERE id = p_delivery_id;
  DELETE FROM social_post_variants WHERE id = v_variant_id;
  IF NOT EXISTS (SELECT 1 FROM social_post_variants WHERE post_id = v_post_id) THEN
    DELETE FROM social_posts WHERE id = v_post_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION delete_social_delivery_post(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_social_delivery_post(UUID) TO authenticated;
