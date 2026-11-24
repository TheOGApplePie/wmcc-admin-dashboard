-- Existing announcements remain published; new and materially edited content requires review.
BEGIN;
ALTER TABLE public.announcements ADD COLUMN review_state text NOT NULL DEFAULT 'approved'
  CHECK (review_state IN ('draft','pending','approved','withdrawn'));
ALTER TABLE public.announcements ALTER COLUMN review_state SET DEFAULT 'draft';
ALTER TABLE public.announcements ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE public.announcements ADD COLUMN approved_by uuid;
ALTER TABLE public.announcements ADD COLUMN approved_at timestamptz;

CREATE TABLE public.announcement_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  announcement_id bigint NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcement_history_item_idx ON public.announcement_history(announcement_id, revision DESC);
ALTER TABLE public.announcement_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcement_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.announcement_history TO authenticated;
CREATE POLICY announcement_history_staff_read ON public.announcement_history FOR SELECT TO authenticated
 USING (public.has_perm('announcements','view'));

CREATE FUNCTION public.guard_announcement_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE material_change boolean;
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.review_state <> 'draft' OR NEW.revision <> 1 OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN
     RAISE EXCEPTION 'New announcements must start as drafts.' USING ERRCODE='42501';
   END IF;
   RETURN NEW;
 END IF;
 material_change := ROW(NEW.title,NEW.description,NEW.poster_url,NEW.poster_alt,NEW.call_to_action_link,
   NEW.call_to_action_caption,NEW.publish_at,NEW.expires_at)
   IS DISTINCT FROM ROW(OLD.title,OLD.description,OLD.poster_url,OLD.poster_alt,OLD.call_to_action_link,
   OLD.call_to_action_caption,OLD.publish_at,OLD.expires_at);
 IF NEW.revision IS DISTINCT FROM OLD.revision OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
   RAISE EXCEPTION 'Approval metadata is managed by the database.' USING ERRCODE='42501';
 END IF;
 IF material_change THEN
   IF NOT public.has_perm('announcements','edit') THEN RAISE EXCEPTION 'Permission denied: announcements.edit' USING ERRCODE='42501'; END IF;
   IF NEW.review_state IS DISTINCT FROM OLD.review_state THEN RAISE EXCEPTION 'Save edits before changing review state.' USING ERRCODE='22023'; END IF;
   NEW.review_state := 'draft'; NEW.approved_by := NULL; NEW.approved_at := NULL;
 ELSIF NEW.review_state IS DISTINCT FROM OLD.review_state THEN
   IF NEW.review_state='approved' AND NOT public.has_perm('announcements','publish') THEN
     RAISE EXCEPTION 'Permission denied: announcements.publish' USING ERRCODE='42501';
   END IF;
   IF (OLD.review_state='draft' AND NEW.review_state='pending') THEN
     IF NOT public.has_perm('announcements','edit') THEN RAISE EXCEPTION 'Permission denied: announcements.edit' USING ERRCODE='42501'; END IF;
   ELSIF (OLD.review_state='pending' AND NEW.review_state IN ('approved','draft')) OR (OLD.review_state='approved' AND NEW.review_state='withdrawn') THEN
     IF NOT public.has_perm('announcements','publish') THEN RAISE EXCEPTION 'Permission denied: announcements.publish' USING ERRCODE='42501'; END IF;
     IF NEW.review_state='approved' THEN
       IF length(btrim(COALESCE(NEW.title,''))) NOT BETWEEN 3 AND 50 OR length(btrim(COALESCE(NEW.description,''))) NOT BETWEEN 20 AND 200 THEN
         RAISE EXCEPTION 'A valid title and description are required for publication.' USING ERRCODE='22023';
       END IF;
       IF (NULLIF(btrim(COALESCE(NEW.call_to_action_link,'')),'') IS NULL) <> (NULLIF(btrim(COALESCE(NEW.call_to_action_caption,'')),'') IS NULL) THEN
         RAISE EXCEPTION 'A call-to-action requires both a link and caption.' USING ERRCODE='22023';
       END IF;
       IF NULLIF(btrim(COALESCE(NEW.poster_url,'')),'') IS NOT NULL AND NULLIF(btrim(COALESCE(NEW.poster_alt,'')),'') IS NULL THEN
         RAISE EXCEPTION 'A poster requires alternative text.' USING ERRCODE='22023';
       END IF;
       IF NEW.expires_at <= now() THEN RAISE EXCEPTION 'Choose an expiration in the future.' USING ERRCODE='22023'; END IF;
       NEW.approved_by := auth.uid(); NEW.approved_at := now();
     ELSE NEW.approved_by := NULL; NEW.approved_at := NULL; END IF;
   ELSIF OLD.review_state='withdrawn' AND NEW.review_state='draft' THEN
     IF NOT public.has_perm('announcements','edit') THEN RAISE EXCEPTION 'Permission denied: announcements.edit' USING ERRCODE='42501'; END IF;
   ELSE RAISE EXCEPTION 'Invalid announcement review transition.' USING ERRCODE='22023'; END IF;
 END IF;
 IF material_change OR NEW.review_state IS DISTINCT FROM OLD.review_state THEN
   INSERT INTO public.announcement_history(announcement_id,revision,snapshot,changed_by)
     VALUES (OLD.id,OLD.revision,to_jsonb(OLD),auth.uid());
   NEW.revision := OLD.revision + 1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_announcement_review() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_announcement_review BEFORE INSERT OR UPDATE ON public.announcements
 FOR EACH ROW EXECUTE FUNCTION public.guard_announcement_review();
DROP POLICY announcements_public_select ON public.announcements;
CREATE POLICY announcements_public_select ON public.announcements FOR SELECT TO anon,authenticated
 USING (review_state='approved' AND (publish_at IS NULL OR publish_at<=now()) AND expires_at>now());
CREATE POLICY announcements_publisher_update ON public.announcements FOR UPDATE TO authenticated
 USING (public.has_perm('announcements','publish')) WITH CHECK (public.has_perm('announcements','publish'));
COMMIT;
