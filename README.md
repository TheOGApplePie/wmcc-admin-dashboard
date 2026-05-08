# WMCC Admin Dashboard

Internal admin panel for managing the Waterdown Muslim Community Centre's public-facing website. Built with Next.js 16 (App Router).

## Features

- **Events** — FullCalendar month/list view with full recurring-event support (daily, weekly, monthly). Create, edit (all / this + future / this occurrence), and delete (all / this + future / this occurrence) events. Supports poster image upload, call-to-action links, and gallery URLs.
- **Announcements** — Create, edit, and expire announcements shown on the public site.
- **Community Feedback** — View feedback submitted through the public site.
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
| Server Actions | next-safe-action |
| Toasts | react-hot-toast |
| Rate limiting | Upstash Redis |

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the required tables (`events`, `recurrence_rule`, `announcements`, etc.)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env.local` file in the project root with the following variables:

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

> **Note:** Routes that use Supabase auth (`/dashboard/announcements`, `/dashboard/community-feedback`) are server-rendered on demand. This is expected — Next.js will report them as dynamic during the build, which is correct behaviour.

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

One row per recurring series. Frequency is stored as `"daily"`, `"weekly"`, or `"monthly"`.

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

## Project Structure

```
app/
  components/       # Shared UI components (EventsCalendar, EventModal, …)
  constants/        # App-wide constants
  dashboard/        # Dashboard route pages
  enums/            # TypeScript enums
  schemas/          # Zod schemas and TypeScript interfaces
  utils/            # Utility functions (date formatting, Supabase client)
actions/            # Next.js Server Actions
features/           # Feature-scoped components (announcements, …)
utils/              # Supabase server/client helpers
```

## Deployment

The project is deployed on Vercel. Push to `main` to trigger a production deployment.
