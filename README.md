# WMCC Admin Dashboard

Internal admin panel for managing the Waterdown Muslim Community Centre's public-facing website. Built with Next.js 16 (App Router).

## Features

- **Events** — FullCalendar month view with full recurring-event support (daily, weekly, monthly). Create, edit (all / this + future / this occurrence), and delete (all / this + future / this occurrence) events. Supports poster image upload, call-to-action links, and gallery URLs.
- **Announcements** — Create, edit, and expire announcements shown on the public site.
- **Social Campaigns** — Create campaigns and platform-specific posts for Instagram Feed, Instagram Story, Instagram Reel, WhatsApp, and TikTok. Includes a combined calendar, manual post CRUD, event/RRULE-driven proposals, review workflows, collision-safe scheduling, Instagram carousels, and permission-aware campaign management.
- **Community Feedback** — View and filter feedback submitted through the public site, with a fixed full-viewport layout and slide-in detail pane.
- **Notifications** — In-app notification bell with 60-second polling badge and dropdown preview of recent notifications.
- **Users Management** — Manage admin user accounts.

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| Language | TypeScript |
| Database & Auth | Supabase (PostgreSQL + SSR auth) |
| Storage | Supabase Storage (event posters and externally accessible social media URLs) |
| UI | Tailwind CSS v4 + DaisyUI v5 |
| Calendar | FullCalendar v7 (daygrid, rrule, interaction) |
| Forms | react-hook-form + Zod v4 |
| Server Actions | next-safe-action v8 |
| Toasts | react-hot-toast |
| Rate limiting | Upstash Redis |

## Getting Started

### Prerequisites

- Node.js 20.9+
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

# Automated social publishing
META_GRAPH_API_VERSION=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
WHATSAPP_ENDPOINT_URL=
WHATSAPP_DESTINATION=
WHATSAPP_API_TOKEN=
TIKTOK_ACCESS_TOKEN=
TIKTOK_BRAND_ORGANIC=false
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

## Social Campaigns

Social content is organized into campaigns. A campaign is a container for posts and may
optionally belong to one event; each event may have at most one campaign. Recurring-event
campaigns continue to reference the parent event and derive future proposals from its RRULE.

Each CMS post currently targets exactly one platform format:

- Instagram Feed, Story, or Reel
- WhatsApp
- TikTok Reel

Users with the appropriate permissions can create, edit, schedule, cancel, and delete posts
from either the campaign list or calendar. Incomplete content may remain a draft. Scheduling
requires valid platform content, a posting date, and a future slot. Deleting a CMS record never
deletes content from an external platform.

### Scheduling contract

- Each platform has three daily slots. Instagram formats share one Instagram schedule.
- Posting dates resolve to fixed UTC instants: morning at `14:00Z`, afternoon at `19:00Z`,
  and evening at `00:00Z` the following day. These remain fixed year-round.
- The calendar displays those instants in `America/Toronto`: 9 AM/2 PM/7 PM during EST and
  10 AM/3 PM/8 PM during EDT.
- Proposed, scheduled, due, processing, and retryable-failed deliveries reserve capacity.
- Only one reserving delivery may occupy a platform/date/slot combination.
- Drafts, cancelled deliveries, sent history, skipped deliveries, and terminal failures do
  not reserve future capacity.
- Standalone campaigns may use no more than two distinct posting dates in a Monday-to-Sunday
  week, with at least three calendar days between dates. Distributing one occurrence to
  several platforms on the same date counts once.
- Campaign start/end boundaries, cadence rules, future-only scheduling, and slot uniqueness
  are enforced by PostgreSQL as well as the application.

### Event-generated proposals

Event-linked campaigns can propose an initial Instagram Feed + WhatsApp post and reminders
at 14, 7, 2, 1, and 0 days before an event. Reminders use Instagram Stories + WhatsApp.
After the first occurrence of a recurring event, only reminders are generated. Proposals
reserve their suggested slots but are not executable until an authorized user reviews and
schedules them.

Changing an event date or RRULE flags its campaign for review. Reviewers can keep individual
posts, keep all affected posts, regenerate individual posts, or regenerate the schedule.
Already-sent deliveries remain immutable. Open-ended RRULEs keep the campaign end date null.

### Automation status

Four authenticated Vercel cron routes are configured:

| Route | UTC schedule | Responsibility |
|---|---:|---|
| `/api/cron/generation` | Monday `12:00` | Extend eligible event campaign proposals |
| `/api/cron/morning` | Daily `14:00` | Claim the morning delivery slot |
| `/api/cron/afternoon` | Daily `19:00` | Claim the afternoon delivery slot |
| `/api/cron/evening` | Daily `00:00` | Claim the evening delivery slot |

Delivery claiming, retry state, terminal-failure notification, and provider adapter scaffolding
exist in the codebase. Live publishing must not be considered production-ready until the
Instagram, WhatsApp, and TikTok credentials, account permissions, payloads, and provider
acceptance tests have been completed. Scheduling can be validated independently of publishing.

> **Scheduling-only rollout:** the three delivery routes actively claim due records. Do not
> enable their Vercel cron entries in an environment containing real scheduled deliveries until
> the corresponding provider adapters are approved. Missing provider configuration is recorded
> as a terminal delivery failure; it is not treated as a harmless dry run.

See [`docs/social-campaigns.md`](docs/social-campaigns.md) for the detailed acceptance rules.

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

### Social data model

The social module separates editorial content from platform delivery state:

| Table | Responsibility |
|---|---|
| `social_campaigns` | Campaign settings, optional event relationship, generation state, review flag, and default channels/assignee |
| `social_campaign_occurrences` | Generated or manual campaign occurrence and milestone metadata |
| `social_posts` | Shared editorial record and parent lifecycle state |
| `social_post_variants` | Platform format, caption, hashtags, CTA, configuration, and ordered media items |
| `social_deliveries` | Platform schedule, resolved UTC instant, delivery state, retry state, consent, and provider result |
| `social_campaign_reviews` | Current event-change or scheduling review for a campaign |
| `social_post_review_items` | Individual affected/suppressed posts and reviewer decisions |

Relevant enums include:

- `social_variant_channel`: `instagram_feed`, `instagram_story`, `instagram_reel`,
  `whatsapp`, `tiktok_reel`
- `social_schedule_platform`: `instagram`, `whatsapp`, `tiktok`
- `social_delivery_status`: `draft`, `proposed`, `scheduled`, `due`, `processing`,
  `sent`, `failed`, `skipped`, `cancelled`
- `social_campaign_status`: `draft`, `active`, `paused`, `completed`, `archived`

Instagram Feed variants accept an ordered `media_items` JSON array containing up to ten
HTTPS image URLs and their required alt text. Other formats accept at most one media item;
WhatsApp requires a caption and treats media as optional.

Social tables use row-level security backed by `has_perm(module, action)`. Board members have
all social permissions. Management and general members receive preset permissions plus any
per-user overrides. Review verdicts require `social.review`; scheduling requires
`social.schedule`; deletion requires `social.delete`.

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
  api/cron/               # Weekly generation and three daily delivery routes
  components/             # Shared UI components (NotificationBell, EventModal, …)
  dashboard/
    posts/                # Social campaign calendar, list, and campaign detail pages
    events/               # Events page and calendar
  enums/                  # Shared TypeScript enums (ResponseCodes, …)
  schemas/                # Zod schemas and TypeScript interfaces
actions/
  socialCampaigns.ts      # Campaign/post CRUD, proposals, reviews, and scheduling
  events.ts               # Event CRUD actions
  notifications.ts        # Notification read/fetch actions
features/
  socialCampaigns/
    components/           # Campaign cards/settings, calendar, reviews, post modal
    scheduling/           # Dates, slots, event milestones, cadence, RRULE expansion
    generation/           # Rolling event-campaign proposal generation
    delivery/             # Provider adapter boundary
  communityFeedback/      # Community feedback table with DVH layout and detail pane
supabase/
  migrations/             # SQL migration files (run in numeric order)
utils/
  actionResponse.ts       # ok() / fail() / clientFail() response envelope helpers
  audit.ts                # logAudit() helper for the audit_logs table
  supabase/               # Supabase server/client/serviceRole helpers
```

## Deployment

The project is deployed on Vercel. Push to `main` to trigger a production deployment.

Before enabling social delivery in production:

1. Apply all pending Supabase migrations in numeric order. In particular, run migration
   `020` before `021`.
2. Confirm role presets and user overrides for `social.view`, `social.edit`,
   `social.schedule`, `social.review`, `social.send`, and `social.delete`.
3. Exercise campaign CRUD, post CRUD, proposal review, slot collisions, standalone cadence,
   and Toronto calendar rendering against the production schema.
4. Configure `CRON_SECRET` and verify Vercel invokes all four cron routes in UTC.
5. Configure and acceptance-test each provider independently before allowing its deliveries
   to be claimed from live accounts.
