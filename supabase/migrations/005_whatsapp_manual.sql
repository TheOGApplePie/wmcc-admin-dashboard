-- WhatsApp is manual-only: track who is assigned to send the WhatsApp message
ALTER TABLE scheduled_posts
  ADD COLUMN assigned_to_email TEXT;
