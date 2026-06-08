# WMCC Admin Dashboard

Internal admin panel for managing the Waterdown Muslim Community Centre's public-facing website. Built with Next.js 16 (App Router).

## Features

- **Events** — FullCalendar month/list view with full recurring-event support (daily, weekly, monthly). Create, edit (all / this + future / this occurrence), and delete (all / this + future / this occurrence) events. Supports poster image upload, call-to-action links, and gallery URLs.
- **Announcements** — Create, edit, and expire announcements shown on the public site.
- **Post Scheduling** — Plan and manage social media posts tied to events. Supports Instagram Feed, Instagram Story, and WhatsApp with optional Facebook cross-post. Posts flow through a `draft → scheduled → posted/failed` lifecycle. Phase 1 uses a fully manual workflow: admins schedule posts and confirm publication with "Mark Sent". In-app notifications alert assignees when a post is assigned to them.
- **Community Feedback** — View and filter feedback submitted through the public site, with a fixed full-viewport layout and slide-in detail pane.
- **Notifications** — In-app notification bell with 60-second polling badge and dropdown preview of recent notifications.
- **Users Management** — Manage admin user accounts.

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| Language | TypeScript |
| Database & Auth | Supabase (PostgreSQL + SSR auth) |
| Storage | Supabase Storage (event posters) |
| UI | Tailwind CSS v4 + DaisyUI v5 |
| Calendar | FullCalendar v6 (daygrid, list, rrule, interaction) |
| Forms | react-hook-form + Zod v4 |
| Server Actions | next-safe-action v8 |
| Toasts | react-hot-toast |
| Rate limiting | Upstash Redis |

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the required tables (see Database Schema below)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Postgres (direct connection for migrations/scripts)
POSTGRES_URL_NON_POOLING=
POSTGRES_PRISMA_URL=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_STRIPE_SERVER_KEY=

# Google Maps
MAPS_API=

# reCAPTCHA
RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=

# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Cron authentication (must match Vercel cron secret)
CRON_SECRET=
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

> **Note:** Routes that use Supabase auth are server-rendered on demand. Next.js will report them as dynamic during the build — this is expected behaviour.

## Post Scheduling — Phase 1 Architecture

Phase 1 is a **fully manual workflow**. There is no automatic publishing to social media APIs.

| Concept | Detail |
|---|---|
| **Platforms** | `instagram_feed`, `instagram_story`, `whatsapp` |
| **Facebook cross-post** | `cross_post_facebook: boolean` flag on instagram posts |
| **`requires_manual`** | `true` on every post in Phase 1 — cron does not auto-publish |
| **Status lifecycle** | `draft → scheduled → posted / failed` |
| **"Schedule" action** | Admin locks a date/slot; post becomes read-only |
| **"Mark Sent" action** | Admin confirms manual publication; sets status to `posted` |
| **Revert** | Scheduled posts can be reverted to `draft` if the slot is still in the future, or if the post is stuck (> 2 hours past scheduled time with no update) |
| **Slot limits** | 2 feed posts per ISO week, 5 story posts per ISO week (REMINDER posts exempt from feed limits) |
| **Time slots** | `morning`, `afternoon`, `evening` — one post per slot per day |
| **Notifications** | `post_assigned` notification inserted via service role client when a post is assigned to another admin |

### Constraint Engine (`features/postScheduling/constraintEngine.ts`)

| Export | Purpose |
|---|---|
| `isRevertable(post)` | Whether a scheduled/failed post can be reverted to draft |
| `checkWeeklyConstraints(posts, date)` | Feed/story counts and remaining capacity for the ISO week |
| `getDayConstraintStates(posts, start, end)` | Day-level availability map for calendar colour-coding |
| `getAvailableSlotsForDate(posts, date, excludeId?)` | Which time slots are free on a given date |
| `resolveSlotCollision(posts, date, slot, eventId)` | Finds the next available slot within 3 days (used in bulk schedule generation) |

## Database Schema

### `events`

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `title` | `text` | Max 50 chars |
| `description` | `text` | Max 300 chars |
| `location` | `text` | |
| `start_date` | `timestamptz` | |
| `end_date` | `timestamptz` | |
| `poster_url` | `text` | Supabase Storage public URL |
| `poster_alt` | `text` | |
| `call_to_action_link` | `text` | |
| `call_to_action_caption` | `text` | |
| `gallery_url` | `text` | |
| `is_recurring` | `bool` | |
| `recurrence_rule_id` | `int8` | FK → `recurrence_rule.id` |

### `recurrence_rule`

One row per recurring series.

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `frequency` | `text` | `"daily"` \| `"weekly"` \| `"monthly"` |
| `interval` | `int4` | Days between occurrences (daily only) |
| `by_weekdays` | `text[]` | e.g. `["MO", "WE"]` |
| `by_month_day` | `int4` | Day of month (1–31) |
| `by_set_position` | `int4[]` | e.g. `[1]` = first, `[-1]` = last |
| `until` | `date` | End date for the series |
| `count` | `int4` | Max occurrences (2–20) |
| `exdates` | `text[]` | ISO date strings of excluded occurrences |

### `post_campaigns`

One row per event's scheduling campaign.

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `event_id` | `int8` | FK → `events.id` |
| `is_recurring_anchor` | `bool` | Whether the event is recurring |

### `scheduled_posts`

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `campaign_id` | `int8` | FK → `post_campaigns.id` |
| `event_id` | `int8` | FK → `events.id` |
| `post_type` | `text` | `ANNOUNCEMENT` \| `GENERAL` \| `REMINDER` |
| `platforms` | `text[]` | `instagram_feed`, `instagram_story`, `whatsapp` |
| `cross_post_facebook` | `bool` | Also cross-post to Facebook |
| `status` | `post_status` | `draft` \| `scheduled` \| `posted` \| `failed` |
| `scheduled_date` | `date` | YYYY-MM-DD |
| `time_slot` | `text` | `morning` \| `afternoon` \| `evening` |
| `scheduled_at` | `timestamptz` | Resolved datetime for the slot |
| `banner_image_url` | `text` | |
| `caption` | `text` | Max 2,200 chars |
| `hashtags` | `text[]` | |
| `whatsapp_text` | `text` | Max 4,096 chars |
| `assigned_to_email` | `text` | Admin assigned to publish this post |
| `created_by_email` | `text` | Admin who created the post |
| `requires_manual` | `bool` | `true` in Phase 1 |
| `is_recurring_reminder` | `bool` | Auto-generated recurring reminder post |
| `retry_count` | `int4` | Cron retry count |
| `next_retry_at` | `timestamptz` | When cron will next retry |
| `updated_at` | `timestamptz` | |

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `type` | `text` | e.g. `post_assigned` |
| `title` | `text` | |
| `body` | `text` | |
| `entity_type` | `text` | e.g. `scheduled_post` |
| `entity_id` | `int8` | ID of the related entity |
| `read_at` | `timestamptz` | Null until the user opens the notification |
| `created_at` | `timestamptz` | |

RLS policies: authenticated users can SELECT and UPDATE their own rows. INSERT requires the service role client (used by the `assignPost` action to notify the assignee).

### `audit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `user_email` | `text` | Denormalized for display |
| `entity_type` | `text` | `event` \| `scheduled_post` |
| `entity_id` | `int8` | |
| `action` | `text` | `create` \| `update` \| `delete` \| `schedule` \| `revert` \| `mark_sent` |
| `detail` | `text` | Human-readable summary of the change |
| `occurred_at` | `timestamptz` | |

## Project Structure

```
app/
  api/                # API routes (cron handler)
  components/         # Shared UI components (NotificationBell, EventModal, …)
  dashboard/          # Dashboard route pages
  schemas/            # Zod schemas and TypeScript interfaces
actions/              # Next.js Server Actions (events, postScheduling, notifications)
features/
  communityFeedback/  # Community feedback table with DVH layout and detail pane
  postScheduling/     # Post scheduling calendar, modal, constraint engine
supabase/
  migrations/         # SQL migration files (run in order)
utils/
  audit.ts            # logAudit() helper for audit_logs table
  supabase/           # Supabase server/client/serviceRole helpers
```

## Deployment

The project is deployed on Vercel. Push to `main` to trigger a production deployment.
