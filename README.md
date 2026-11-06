# WMCC Admin Dashboard

Internal CMS for the Waterdown Muslim Community Centre website. Built with Next.js 16,
TypeScript, Supabase, and FullCalendar.

## Features

- Draft/published events with multiple schedules, recurring sessions, and poster inheritance
- Announcements
- Social campaigns, post scheduling, and event-based proposal generation
- Community feedback
- In-app notifications
- Team and permission management

## Local development

See [event schedules and migration guidance](docs/event-schedules.md) for the new schema, public-site reader changes, campaign compatibility, and cutover checks.

### Requirements

- Node.js 22 or newer (also configure this runtime in Vercel)
- Access to the WMCC Supabase project

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Available checks and production commands:

```bash
npm run lint
npm run build
npm start
```

## Environment variables

Create `.env.local` in the project root. Obtain project-specific values from the corresponding
service dashboards; never commit secrets.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cron authentication
CRON_SECRET=

# Social delivery
SOCIAL_DELIVERY_ENABLED=false
META_GRAPH_API_VERSION=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_TOKEN_ENCRYPTION_KEY=
WHATSAPP_SERVICE_URL=
WHATSAPP_API_TOKEN=
TIKTOK_ACCESS_TOKEN=
TIKTOK_BRAND_ORGANIC=false
```

Configure these values separately in Vercel Production; `.env.local` is not uploaded
by the GitHub workflows. `CRON_SECRET` must match the GitHub Actions secret; requests
use `Authorization: Bearer <CRON_SECRET>`. The WhatsApp API token is a different
secret, shared only between the CMS and the separate sender service.

`INSTAGRAM_TOKEN_ENCRYPTION_KEY` is a 32-byte key represented as 64 hexadecimal
characters. Keep it stable across deployments so refreshed tokens remain readable.
Provider credentials and this key stay on the application servers, not in GitHub
Actions. Instagram uses the Instagram Login API at `graph.instagram.com`.

## Database

Supabase migrations live in [`supabase/migrations`](supabase/migrations) and must be applied in
numeric order. Migrations `023` and `024` must remain separate because PostgreSQL must commit
the new enum value before later statements use it.

The application relies on Supabase Auth, PostgreSQL row-level security, and
`has_perm(module, action)` for authorization. After changing permission migrations, verify role
presets and user overrides in the target environment.

The current integration migrations are:

| Migration | Purpose |
| --- | --- |
| `034` | Copy details between campaign posts |
| `035` | Link CMS users to their WhatsApp accounts |
| `036` | Record the approving publisher and expose permission checks for the sender |
| `037` | Store refreshed Instagram tokens encrypted, accessible only to the service role |

Migration 037 only adds credential storage. Publishing uses the existing social-post
claim, pending-state, completion, and recovery functions.

## Social scheduling

Social campaigns group posts and may optionally be linked to one event. The module supports:

- Campaign and post CRUD
- Instagram Feed, Story, and Reel; WhatsApp; and TikTok Reel formats
- Drafts and collision-safe scheduling
- Three daily platform slots
- Event/RRULE-based schedule proposals and reviews
- Instagram carousels using media selected from Supabase Storage
- Weekly proposal generation

Generated posts begin as proposals and require approval by someone with
`social.publish` before delivery. Draft posts do not reserve schedule capacity.
Manual generation can be previewed before saving; saving regenerates from current
event/calendar data using the existing database version checks.

WhatsApp approval records the approving user as `publisher_user_id` and requires
their paired account. At send time, the separate WhatsApp service rechecks their
publishing permission, active status, ownership, and connected session.

Instagram creates a media container, then checks readiness. If ready, it publishes
in the same delivery run. Otherwise, the container is saved as pending and checked
by a later run. The daily health job checks account access and publishing quota;
eligible long-lived tokens are renewed weekly and saved encrypted. Failed checks
notify publishers. Expired or revoked tokens require reconnecting through Meta.

Available formats in the editor do not establish production readiness. See
[provider readiness](docs/social-provider-readiness.md) before enabling a provider.

### Cron routes

| Route                  |   UTC schedule | Purpose                                   |
| ---------------------- | -------------: | ----------------------------------------- |
| `/api/cron/generation` | Monday `12:00` | Extend eligible event campaign proposals  |
| `/api/cron/instagram-health` | Daily `11:00` | Check account access and renew eligible Instagram tokens |
| `/api/cron/delivery` | Every 5 minutes | Send due posts, retry deliveries, and follow up Instagram containers |

GitHub Actions schedules three endpoints; Vercel's cron list is empty. The unified
`/api/cron/delivery` worker runs at :02, :07, …, :57. It claims only due work across
all platforms, including Instagram containers awaiting processing. Morning,
afternoon, and evening remain calendar slots, not separate cron jobs.
Workflows remain gated until `SOCIAL_CRON_ENABLED=true` is set. Apply migration
037 before enabling. See [GitHub setup and cutover](docs/social-cron-github.md).

The workflow files live in [`.github/workflows`](.github/workflows). Each calls the
shared workflow, which runs [`scripts/run-social-cron.mjs`](scripts/run-social-cron.mjs)
to make one authenticated GET to `{CMS_BASE_URL}/api/cron/{job}`. The CMS performs
the work; GitHub never calls Instagram or the WhatsApp sender directly.

Configure repository Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `CMS_BASE_URL` | Production CMS HTTPS origin, without a path |
| Secret | `CRON_SECRET` | Same value as Vercel Production |
| Variable | `SOCIAL_CRON_ENABLED` | `true` when deployment and migrations are ready |
| Optional secret | `VERCEL_AUTOMATION_BYPASS_SECRET` | Only when deployment protection requires it |

Workflows support manual runs and must be on the default branch for scheduling.
GitHub timing is best effort. Five-minute delivery polling creates about 8,640
runs per 30-day month; account for private-repository Actions usage.

All three routes return `ok` and `summary`. HTTP errors or `ok=false` fail the
GitHub run. Pending processing and CMS-managed retries are normal outcomes.
The runner never automatically retries a request that may already have sent posts.

CMS logs include a run ID, start, and one completion summary with counts, status,
and duration. Skips and failures include identifying context. Tokens and post
content are not logged. Use GitHub summaries for counts and Vercel runtime logs
for details.

For a scheduling-only deployment, keep:

```env
SOCIAL_DELIVERY_ENABLED=false
```

The delivery worker authenticates and returns a bypass summary without claiming
posts. Generation and Instagram health are independent of the delivery flag.
Do not enable sending until the intended providers have passed acceptance checks.

Detailed documentation:

- [Social campaign behavior](docs/social-campaigns.md)
- [Provider readiness](docs/social-provider-readiness.md)
- [Manual acceptance cases](docs/social-manual-test-cases.md)

## Deployment

The application is deployed through Vercel.

Before enabling scheduled work:

1. Keep GitHub's `SOCIAL_CRON_ENABLED` unset or `false`, and CMS delivery disabled.
2. Apply pending migrations in numeric order, including 037.
3. Configure production CMS and sender credentials, using Node.js 22 or newer.
4. Push workflows to the default branch and deploy the CMS. Confirm Vercel's old
   cron schedules are removed; `vercel.json` intentionally has an empty cron list.
5. Configure GitHub's variables/secrets and set `SOCIAL_CRON_ENABLED=true`.
6. Manually run Instagram health and verify its summary. Run delivery while disabled
   to verify authentication and the bypass response.
7. Review overdue posts, permissions, and provider readiness. Set
   `SOCIAL_DELIVERY_ENABLED=true` in Vercel, redeploy, and verify a controlled post.

The delivery switch applies to all platforms. The worker can pick up overdue posts
as soon as sending is enabled. Detailed cutover steps are in
[the GitHub cron guide](docs/social-cron-github.md).

## Scheduled announcements

Choose **Go live now** or **Schedule for later** when creating or editing an announcement.
Scheduling requires a future go-live date and time in Toronto time; it stays hidden until
that instant. You can switch a scheduled announcement to live now, or move a live one
back to a future schedule. Changes take effect when you save. The end date must follow
the go-live time.
The Scheduled tab previews upcoming announcements; the dashboard refreshes every 30 seconds.

Apply `supabase/migrations/026_scheduled_announcements.sql` after migration 025
and before deploying. It adds `publish_at` and checks the publication window on each
public database read; no cron job is needed. Existing announcements have no scheduled
go-live time and retain their current publication behavior.

The public website is maintained separately. Its queries must filter
`publish_at IS NULL OR publish_at <= current time` and `expires_at > current time` if
using a service-role client or authenticated staff session, which can read hidden rows.
Public-site caches must refresh or expire at the scheduled time for visitors to see the
announcement then. Database eligibility alone cannot refresh a cached page.

Announcement reordering also requires `supabase/migrations/027_atomic_announcement_order.sql`.
It updates the entire submitted order in one transaction and rejects missing or inaccessible rows.

## Shared media picker

Announcements, events, and social posts share a storage browser with folder navigation,
filtering of loaded items, pagination, and uploads. Browsing and upload authorization
use the current module's edit permission.

Image-only contexts open `event-posters/public`; video-only contexts open `videos/public`.
Uploads go to the current bucket and folder using a signed upload URL and unique filenames:

- Images: up to 5 MB; JPG/JPEG only. PNG and other image formats are excluded
  from uploads and picker selection.
- Instagram feed/carousel images: exact 4:5 displayed ratio, e.g. 1080 × 1350,
  checked before scheduling and publishing. Every carousel image must comply.
- Instagram Stories: JPEG-only; the feed's 4:5 requirement does not apply.
- Videos: up to 50 MB; MP4 only.

Uploads are saved immediately, even if the picker is cancelled. They are selected automatically
when the selection limit permits. **Use selected media** requires a non-empty selection and
is disabled during loading/uploading or after a listing error. Listing failures offer retry;
upload success and failure messages appear inside the picker.

The picker does not crop or convert incompatible images. Existing stored files are
not deleted by these restrictions.
