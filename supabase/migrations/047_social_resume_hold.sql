-- A resumed campaign must not automatically publish work that became overdue while paused.
BEGIN;
CREATE FUNCTION public.hold_overdue_social_posts_on_resume() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'paused' AND NEW.status = 'active' THEN
    UPDATE public.social_posts
       SET status = CASE WHEN status = 'scheduled' THEN 'draft'::public.social_post_status ELSE status END,
           scheduled_at = CASE WHEN status = 'scheduled' THEN NULL ELSE scheduled_at END,
           next_attempt_at = NULL,
           publication_consented_at = CASE WHEN status = 'scheduled' THEN NULL ELSE publication_consented_at END,
           publication_consented_by = CASE WHEN status = 'scheduled' THEN NULL ELSE publication_consented_by END,
           needs_review = true,
           review_reason = 'This post became overdue while the campaign was paused. Review before rescheduling.'
     WHERE campaign_id = NEW.id AND status IN ('scheduled', 'failed')
       AND scheduled_at <= now();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hold_overdue_social_posts_on_resume() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER hold_overdue_social_posts_on_resume
  BEFORE UPDATE OF status ON public.social_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.hold_overdue_social_posts_on_resume();
COMMIT;
