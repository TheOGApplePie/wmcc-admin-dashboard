# WMCC Admin Dashboard

Internal CMS for the Waterdown Muslim Community Centre website. Built with Next.js 16,
TypeScript, Supabase, and FullCalendar.

## Features

- Events and recurring-event management
- Announcements
- Social campaigns, post scheduling, and event-based proposal generation
- Community feedback
- In-app notifications
- Team and permission management

## Local development

### Requirements

- Node.js 20.9 or newer
- Access to the WMCC Supabase project

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To verify a production build:

```bash
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
WHATSAPP_ENDPOINT_URL=
WHATSAPP_DESTINATION=
WHATSAPP_API_TOKEN=
TIKTOK_ACCESS_TOKEN=
TIKTOK_BRAND_ORGANIC=false
```

`CRON_SECRET` should be a randomly generated secret configured in Vercel. Vercel sends it to
cron routes as `Authorization: Bearer <CRON_SECRET>`.

## Database

Supabase migrations live in [`supabase/migrations`](supabase/migrations) and must be applied in
numeric order. Migrations `023` and `024` must remain separate because PostgreSQL must commit
the new enum value before later statements use it.

The application relies on Supabase Auth, PostgreSQL row-level security, and
`has_perm(module, action)` for authorization. After changing permission migrations, verify role
presets and user overrides in the target environment.

## Social scheduling

Social campaigns group posts and may optionally be linked to one event. The module supports:

- Campaign and post CRUD
- Instagram Feed, Story, and Reel; WhatsApp; and TikTok Reel formats
- Drafts and collision-safe scheduling
- Three daily platform slots
- Event/RRULE-based schedule proposals and reviews
- Instagram carousels using media selected from Supabase Storage
- Weekly proposal generation

Generated posts begin as proposals and require authorized confirmation before they can be
delivered. Draft posts do not reserve schedule capacity.

### Cron routes

| Route | UTC schedule | Purpose |
|---|---:|---|
| `/api/cron/generation` | Monday `12:00` | Extend eligible event campaign proposals |
| `/api/cron/morning` | Daily `14:00` | Process due social deliveries |
| `/api/cron/afternoon` | Daily `19:00` | Process due social deliveries and retries |
| `/api/cron/evening` | Daily `00:00` | Process due social deliveries and retries |

For a scheduling-only deployment, keep:

```env
SOCIAL_DELIVERY_ENABLED=false
```

Delivery routes will authenticate and return a successful bypass response without claiming
posts. Do not enable delivery until each provider has valid credentials and has passed manual
acceptance testing.

Detailed documentation:

- [Social campaign behavior](docs/social-campaigns.md)
- [Provider readiness](docs/social-provider-readiness.md)
- [Manual acceptance cases](docs/social-manual-test-cases.md)

## Deployment

The application is deployed through Vercel.

Before a production release:

1. Apply pending Supabase migrations in numeric order.
2. Configure the required Vercel environment variables.
3. Verify social permission presets and overrides.
4. Complete the relevant manual acceptance cases.
5. Verify all four cron routes authenticate successfully.
6. Keep social delivery disabled until provider integrations are approved for live use.

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

- Images: up to 5 MB; JPEG/JPG/PNG. Instagram image selection remains JPEG-only.
- Videos: up to 50 MB; MP4 only.

Uploads are saved immediately, even if the picker is cancelled. They are selected automatically
when the selection limit permits. **Use selected media** requires a non-empty selection and
is disabled during loading/uploading or after a listing error. Listing failures offer retry;
upload success and failure messages appear inside the picker.
