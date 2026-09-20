-- 015: Flag linked campaigns when event timing or recurrence changes.

CREATE OR REPLACE FUNCTION flag_social_campaigns_for_event_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.is_recurring IS DISTINCT FROM OLD.is_recurring
     OR NEW.recurrence_rule_id IS DISTINCT FROM OLD.recurrence_rule_id THEN
    UPDATE social_campaigns
       SET needs_review = TRUE,
           review_reason = 'The linked event schedule changed.',
           updated_at = NOW()
     WHERE event_id = NEW.id
       AND status NOT IN ('completed', 'archived');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_campaign_event_review
  AFTER UPDATE OF start_date, end_date, is_recurring, recurrence_rule_id ON events
  FOR EACH ROW EXECUTE FUNCTION flag_social_campaigns_for_event_review();

CREATE OR REPLACE FUNCTION preserve_social_campaigns_before_event_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE social_campaigns
     SET needs_review = TRUE,
         review_reason = 'The linked event was deleted.',
         status = CASE WHEN status = 'active' THEN 'paused' ELSE status END,
         updated_at = NOW()
   WHERE event_id = OLD.id
     AND status NOT IN ('completed', 'archived');
  RETURN OLD;
END;
$$;

CREATE TRIGGER social_campaign_event_delete
  BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION preserve_social_campaigns_before_event_delete();

CREATE OR REPLACE FUNCTION flag_social_campaigns_for_rrule_review()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.frequency, NEW.interval, NEW.by_weekdays, NEW.by_month_day,
         NEW.by_set_position, NEW.until, NEW.count, NEW.exdates)
     IS DISTINCT FROM
     ROW(OLD.frequency, OLD.interval, OLD.by_weekdays, OLD.by_month_day,
         OLD.by_set_position, OLD.until, OLD.count, OLD.exdates) THEN
    UPDATE social_campaigns AS campaign
       SET needs_review = TRUE,
           review_reason = 'The linked recurring-event schedule changed.',
           updated_at = NOW()
      FROM events AS event
     WHERE event.recurrence_rule_id = NEW.id
       AND campaign.event_id = event.id
       AND campaign.status NOT IN ('completed', 'archived');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER social_campaign_rrule_review
  AFTER UPDATE ON recurrence_rule
  FOR EACH ROW EXECUTE FUNCTION flag_social_campaigns_for_rrule_review();
