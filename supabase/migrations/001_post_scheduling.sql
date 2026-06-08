-- ─── Post Scheduling System Migration ────────────────────────────────────────
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE post_type AS ENUM ('ANNOUNCEMENT', 'GENERAL', 'REMINDER');
CREATE TYPE time_slot AS ENUM ('morning', 'afternoon', 'evening');
CREATE TYPE post_status AS ENUM ('draft', 'confirmed', 'scheduled', 'posted', 'failed');
CREATE TYPE platform_type AS ENUM (
  'instagram_feed',
  'instagram_story',
  'instagram_reel',
  'facebook_feed',
  'whatsapp'
);

-- ─── Alter existing events table ─────────────────────────────────────────────

ALTER TABLE events
  ADD COLUMN schedule_posts_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── post_campaigns ───────────────────────────────────────────────────────────
-- One campaign per event. Tracks the meta-state of the whole schedule.
-- ON DELETE CASCADE: deleting an event removes its campaign and all posts.

CREATE TABLE post_campaigns (
  id                  BIGSERIAL PRIMARY KEY,
  event_id            BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  is_recurring_anchor BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id)
);

-- ─── scheduled_posts ─────────────────────────────────────────────────────────

CREATE TABLE scheduled_posts (
  id                    BIGSERIAL PRIMARY KEY,
  campaign_id           BIGINT NOT NULL REFERENCES post_campaigns(id) ON DELETE CASCADE,
  event_id              BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Classification
  post_type             post_type NOT NULL,
  is_story              BOOLEAN NOT NULL DEFAULT FALSE,
  is_recurring_reminder BOOLEAN NOT NULL DEFAULT FALSE,
  occurrence_date       DATE,           -- which recurrence occurrence this reminder covers

  -- Platforms
  platforms             platform_type[] NOT NULL,

  -- Content
  banner_image_url      TEXT,
  caption               TEXT,
  hashtags              TEXT[],         -- Instagram only
  whatsapp_text         TEXT,           -- WhatsApp only

  -- Scheduling
  scheduled_date        DATE NOT NULL,
  time_slot             time_slot NOT NULL,
  scheduled_at          TIMESTAMPTZ NOT NULL,  -- resolved absolute UTC timestamp

  -- Lifecycle
  status                post_status NOT NULL DEFAULT 'draft',
  retry_count           SMALLINT NOT NULL DEFAULT 0,
  requires_manual       BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sp_campaign  ON scheduled_posts(campaign_id);
CREATE INDEX idx_sp_event     ON scheduled_posts(event_id);
CREATE INDEX idx_sp_date_slot ON scheduled_posts(scheduled_date, time_slot, status);

-- ─── post_logs ────────────────────────────────────────────────────────────────

CREATE TABLE post_logs (
  id        BIGSERIAL PRIMARY KEY,
  post_id   BIGINT NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status    post_status NOT NULL,
  message   TEXT,
  platform  platform_type
);

CREATE INDEX idx_post_logs_post_id ON post_logs(post_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Dashboard uses the anon key (add policies to match your auth setup).
-- Cron routes use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely.

ALTER TABLE post_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_logs       ENABLE ROW LEVEL SECURITY;
