BEGIN;

-- Historical modification times are unknown; do not invent a backfill.
ALTER TABLE public.events ADD COLUMN updated_at timestamptz;
-- The existing timestamp function is generic: reuse it rather than add another.
CREATE TRIGGER events_updated_at BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.set_social_updated_at();

COMMIT;
