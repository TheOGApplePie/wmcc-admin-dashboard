# WMCC Admin Dashboard

Internal admin panel for managing the Waterdown Muslim Community Centre's public-facing website. Built with Next.js 16 (App Router).

## Features

- **Events** — FullCalendar month/list view with full recurring-event support (daily, weekly, monthly). Create, edit (all / this + future / this occurrence), and delete (all / this + future / this occurrence) events. Supports poster image upload, call-to-action links, and gallery URLs.
- **Announcements** — Create, edit, and expire announcements shown on the public site.
- **Social Posts** — Plan and schedule social media posts across Instagram Feed, Instagram Story, and WhatsApp. Posts flow through an `idea → draft → scheduled → published/failed` lifecycle. Phase 1 is a fully manual workflow: admins compose, schedule, and confirm publication. Phase 2 will integrate live publishing via Instagram Graph API and WhatsApp Business Cloud API.
- **Community Feedback** — View and filter feedback submitted through the public site, with a fixed full-viewport layout and slide-in detail pane.
- **Notifications** — In-app notification bell with 60-second polling badge and dropdown preview of recent notifications.
- **Users Management** — Manage admin user accounts.

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| Language | TypeScript |
| Database & Auth | Supabase (PostgreSQL + SSR auth) |
| Storage | Supabase Storage (event posters, social post media) |
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

## Social Posts — Phase 1 Architecture

Phase 1 is a **fully manual workflow**. There is no automatic publishing to social media APIs.

| Concept | Detail |
|---|---|
| **Channels** | `ig_feed`, `ig_story`, `whatsapp` |
| **Post types** | `ANNOUNCEMENT`, `GENERAL`, `REMINDER` |
| **Status lifecycle** | `idea → draft → scheduled → published / failed` |
| **Time slots** | `morning` (9 am), `afternoon` (1 pm), `evening` (6 pm) — one post per slot per day |
| **"Schedule" action** | Admin locks a date/slot; post is marked `scheduled` |
| **"Save & unschedule"** | Saves edits and reverts the post to `draft` |
| **"Save changes"** | Saves edits to a `scheduled` post without changing its status |
| **Media upload** | Required for `ig_feed` and `ig_story` posts; stored in the `social-media` Supabase Storage bucket |
| **IG aspect ratio** | Feed: enforces standard ratios (1:1, 4:5, 1.91:1). Story: width/height ≤ 0.64 (9:16 target) |
| **Event linking** | `ANNOUNCEMENT` and `REMINDER` posts must be linked to an event |
| **Audit trail** | Every create/update/delete/schedule/publish action is logged to `audit_logs` |

### Phase 2 (planned)

Live publishing via Instagram Graph API and WhatsApp Business Cloud API. The `publishSocialPost` server action is a stub seam — Phase 2 replaces its body without touching the rest of the codebase.

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

### `social_posts`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key (`gen_random_uuid()`) |
| `title` | `text` | Max 120 chars |
| `caption` | `text` | Max 1,000 chars |
| `hashtags` | `text[]` | Max 30 tags |
| `channels` | `social_channel[]` | `ig_feed`, `ig_story`, `whatsapp` |
| `status` | `social_post_status` | `idea` \| `draft` \| `scheduled` \| `published` \| `failed` |
| `post_type` | `text` | `ANNOUNCEMENT` \| `GENERAL` \| `REMINDER` |
| `time_slot` | `text` | `morning` \| `afternoon` \| `evening` |
| `scheduled_at` | `timestamptz` | Resolved slot datetime |
| `media_url` | `text` | Supabase Storage public URL |
| `event_id` | `int8` | FK → `events.id` ON DELETE SET NULL |
| `assigned_to` | `uuid` | FK → `auth.users.id` |
| `last_notified_at` | `timestamptz` | When the assignee was last notified |
| `created_by` | `uuid` | FK → `auth.users.id` ON DELETE CASCADE |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-updated via trigger |

RLS policies: authenticated users can SELECT/INSERT/UPDATE/DELETE all posts (team collaboration model). INSERT requires `created_by = auth.uid()`.

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `type` | `text` | e.g. `post_assigned` |
| `title` | `text` | |
| `body` | `text` | |
| `entity_type` | `text` | e.g. `social_post` |
| `entity_id` | `text` | ID of the related entity |
| `read_at` | `timestamptz` | Null until the user opens the notification |
| `created_at` | `timestamptz` | |

RLS policies: authenticated users can SELECT and UPDATE their own rows. INSERT requires the service role client.

### `audit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | `int8` | Primary key |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `user_email` | `text` | Denormalized for display |
| `entity_type` | `text` | e.g. `social_post`, `event` |
| `entity_id` | `text` | Supports both UUID and integer entity IDs |
| `action` | `text` | `create` \| `update` \| `delete` \| `schedule` \| `publish` |
| `detail` | `text` | Human-readable summary of the change |
| `occurred_at` | `timestamptz` | |

## Project Structure

```
app/
  api/                    # API routes (cron handler)
  components/             # Shared UI components (NotificationBell, EventModal, …)
  dashboard/
    posts/                # Social Posts page (/dashboard/posts)
    events/               # Events page and calendar
  enums/                  # Shared TypeScript enums (ResponseCodes, …)
  schemas/                # Zod schemas and TypeScript interfaces
actions/
  socialPosts.ts          # CRUD, schedule, publish, upload actions for social posts
  events.ts               # Event CRUD actions
  notifications.ts        # Notification read/fetch actions
features/
  socialPosts/
    components/           # PostComposer, PostQueue, PostPreview, StatsStrip, …
    components/icons.tsx  # Named SVG icon components
    hooks/                # usePostForm, useMediaUpload
    types.ts              # Shared prop interfaces for all socialPosts components
  communityFeedback/      # Community feedback table with DVH layout and detail pane
supabase/
  migrations/             # SQL migration files (run in order, 001 → 009)
utils/
  actionResponse.ts       # ok() / fail() / clientFail() response envelope helpers
  audit.ts                # logAudit() helper for the audit_logs table
  supabase/               # Supabase server/client/serviceRole helpers
```

## Deployment

The project is deployed on Vercel. Push to `main` to trigger a production deployment.
