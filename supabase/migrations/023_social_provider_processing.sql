-- 023: Track asynchronous provider processing without consuming failure retries.

ALTER TYPE social_delivery_status
  ADD VALUE IF NOT EXISTS 'provider_processing' AFTER 'processing';
