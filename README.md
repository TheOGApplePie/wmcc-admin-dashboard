# WMCC Admin Dashboard

Internal admin panel for managing the Waterdown Muslim Community Centre's public-facing website. Built with Next.js 16 (App Router).

## Features

- **Events** — FullCalendar month view with full recurring-event support (daily, weekly, monthly). Create, edit (all / this + future / this occurrence), and delete (all / this + future / this occurrence) events. Supports poster image upload, call-to-action links, and gallery URLs.
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
| Calendar | FullCalendar v7 (daygrid, rrule, interaction) |
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
| `description` | `text` | Max 1,500 chars |
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
| `count` | `int4` | Max occurrences (1–20); user-created series normally start at 2+ |
| `exdates` | `text[]` | ISO date strings of excluded occurrences |

### Event module behaviour

- Event timestamps are stored as UTC instants and interpreted and displayed in
  `America/Toronto`. Recurrence calculations must preserve Toronto wall-clock
  time across daylight-saving transitions.
- Recurrence termination dates are inclusive.
- Editing all occurrences from a selected occurrence moves the series so it
  begins at that selected occurrence.
- Editing "this and future" splits the remaining occurrence budget. For
  example, splitting occurrence 6 of a 10-occurrence series creates a new
  series containing occurrences 6–10, while the original series contains
  occurrences 1–5.
- Past events are supported.
- Recurring events may span midnight or multiple days; generated occurrences
  must preserve the event's start/end relationship.
- A replacement for one edited occurrence is an independent event and does not
  require a persisted link back to its original series.
- Event titles and navigation slugs are not unique at this time.
- Poster images must be hosted in the WMCC Supabase project. Gallery URLs are
  optional and restricted to `institutei3-my.sharepoint.com`.
- Gallery URLs are editable in the event modal but are not shown in the event
  detail pane.
- Stored poster objects are not deleted when an event stops referencing them,
  because the same object may be used by another module.
- Poster object names are globally human-readable. When a title-based filename
  already exists, append an underscore and numeric suffix (`event_1.jpg`,
  `event_2.jpg`, up to `event_3.jpg`).
- The admin dashboard and public site must produce identical occurrences from
  the same recurrence rule. Both use FullCalendar for calendar rendering.

### Deferred event decisions

The following event concerns are intentionally deferred and must be revisited
before their related work is implemented:

- How occurrence and series mutations affect social posts, campaigns, and
  scheduled reminders.
- The long-term navigation-slug collision and uniqueness strategy.
- Event permissions by role. Event RLS is enabled, but the detailed permission
  model belongs to a separate pull request.
- Add optimistic concurrency for simultaneous edits by multiple administrators.
  Introduce an authoritative `updated_at` or version column, require the
  version read by the modal on every update/delete, return a specific stale
  conflict without overwriting either editor, and provide a reload/reapply
  workflow. Cover recurrence splits and compensation paths, not only ordinary
  row edits.
- Add cross-session calendar freshness after the concurrency contract exists.
  Revalidate the active FullCalendar range on window focus and optionally from
  a debounced Supabase Realtime subscription to `events` and
  `recurrence_rule`; retain request IDs so late responses cannot replace newer
  data, preserve the selected day when possible, and show a non-destructive
  refresh error without blanking the last successful calendar.
- Choose an event test framework and add automated coverage for the complete
  create/edit/delete action matrix; malformed and mismatched IDs; zero-row
  mutations; count/until exclusivity; inclusive Toronto dates; DST gaps and
  folds; exact occurrence membership and exclusions; count- and until-based
  final-occurrence splits; stale responses; and every compensation failure.
- Unify the dashboard home page's standalone `rrule` expansion with the events
  page/public site's FullCalendar occurrence generation. The follow-up must
  verify identical start times, inclusive end dates, exclusions, count limits,
  multi-day durations, and DST transitions in `America/Toronto`.
- Replace compensating multi-request recurrence mutations with PostgreSQL
  functions invoked through `supabase.rpc()`. The RPCs should atomically own
  create, series update, future split, single-occurrence replacement, recurrence
  removal, and series deletion; raise on every failed invariant/write; return
  affected IDs; and be exercised against partial-failure and authorization
  cases. Storage uploads remain outside the database transaction and require
  explicit cleanup when a subsequent RPC fails.
- Evaluate direct-to-Storage poster uploads using short-lived signed upload
  URLs. Keep the same client and server validation (JPEG/PNG, maximum 5 MB,
  Supabase destination, required alt text), request the signed URL only after
  metadata validation, upload with `upsert: false`, then submit the returned
  trusted object path with the event mutation. Define orphan cleanup for an
  upload followed by an abandoned or failed event save.
- Replace the current production-aligned public-read/authenticated-write event
  policies with role-aware policies in the permissions PR. Test anonymous,
  authenticated, and service-role access before rollout.
- Refactor `EventModal` in a dedicated maintainability PR. Extract reusable
  details, links, poster, recurrence, and action sections plus hooks for form
  defaults, poster lifecycle, and mutations, and a form-to-action payload
  mapper. Preserve dirty-state semantics and all loading/success/error states
  while adding focused component boundaries.
- Run and resolve repository-wide lint in its dedicated cleanup PR.
- Make event audit logging authoritative in the next release. Decide whether
  authenticated inserts use an `audit_logs` RLS policy constrained to
  `user_id = auth.uid()` or a server-owned/`SECURITY DEFINER` RPC; stop ignoring
  insert failures; define whether an audit failure rolls back the mutation;
  and test authenticated, anonymous, and service-role behavior.
- Review the product meaning of selecting multiple weekdays together with
  multiple monthly positions. The current implementation follows standard
  RRULE `BYDAY` + `BYSETPOS` semantics; any "first Monday and first Wednesday"
  interpretation needs a separately specified recurrence model.

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
  migrations/             # SQL migration files (run in order, 001 → 011)
utils/
  actionResponse.ts       # ok() / fail() / clientFail() response envelope helpers
  audit.ts                # logAudit() helper for the audit_logs table
  supabase/               # Supabase server/client/serviceRole helpers
```

## Deployment

The project is deployed on Vercel. Push to `main` to trigger a production deployment.
