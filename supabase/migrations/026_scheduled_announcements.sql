-- Existing announcements keep their publication behavior (NULL = immediate).
-- Publication is evaluated on each read; no cron job or status update is needed.
BEGIN;

ALTER TABLE public.announcements ADD COLUMN publish_at timestamptz;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_publication_window
  CHECK (publish_at IS NULL OR publish_at < expires_at);

DROP POLICY announcements_public_select ON public.announcements;
CREATE POLICY announcements_public_select ON public.announcements
  FOR SELECT TO anon, authenticated
  USING ((publish_at IS NULL OR publish_at <= now()) AND expires_at > now());

-- Staff can preview scheduled announcements and manage expired ones.
CREATE POLICY announcements_staff_select ON public.announcements
  FOR SELECT TO authenticated
  USING (has_perm('announcements', 'view') OR has_perm('announcements', 'edit'));

COMMIT;
