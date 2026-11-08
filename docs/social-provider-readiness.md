# Social provider readiness

Scheduling is provider-independent. Keep `SOCIAL_DELIVERY_ENABLED=false` until a provider's
account, credentials, validation, and manual acceptance cases are complete.

## Instagram

The account uses **Instagram Login** and `graph.instagram.com`.

### Configuration and verification

1. In Meta App Dashboard → Instagram → API setup with Instagram login, confirm the
   connected professional account and granted `instagram_business_basic` and
   `instagram_business_content_publish` permissions. Account/app eligibility still
   needs verification for each format, especially Stories.
2. Set the matching `INSTAGRAM_DEV_ACCOUNT_ID` / `INSTAGRAM_DEV_ACCESS_TOKEN` or `INSTAGRAM_PROD_ACCOUNT_ID` / `INSTAGRAM_PROD_ACCESS_TOKEN`, and
   `META_GRAPH_API_VERSION`. The local account and publishing-quota endpoints were
   successfully checked without creating or publishing media. Meta returned API
   version `v25.0`, now configured locally. Production needs its own configuration.
3. Apply migration `037_instagram_publishing.sql` after 036.
4. Configure a 32-byte hex `INSTAGRAM_TOKEN_ENCRYPTION_KEY` in production. A local
   key was generated in `.env.local`; keep the same key across deployments so stored
   credentials remain readable. Never expose it to browsers or commit it.
5. Run `/api/cron/instagram-health` using `Authorization: Bearer <CRON_SECRET>`.
   This performs read-only account/quota checks and may refresh the access token.
   It does not publish a post. Meta's dashboard/token tools remain the place to
   confirm the exact granted scopes and original token lifetime.

### Basic two-step publication

1. The delivery worker creates the image, Story, Reel, or carousel container.
2. It checks readiness immediately. If `FINISHED`, it calls `media_publish` and
   records the published media ID in the same run.
3. If still `IN_PROGRESS`, the existing pending-delivery RPC saves the container
   ID as `provider_processing`. A later five-minute run checks and publishes it.
   There is no forced delay for ready containers and no long-running polling loop.
4. A permalink is retrieved when possible. A permalink failure does not undo a
   successful publication or cause another send.
5. `ERROR`, `EXPIRED`, or an unexpected already-published container becomes a
   normal failed delivery with a publisher notification. Check Instagram manually
   before scheduling a replacement in those cases.

There is no separate checkpoint RPC, Instagram-only claim/recovery function, or
reconciliation workflow. The existing shared worker, retries, and stale-worker
recovery are reused. Rare interruptions between Meta accepting a request and the
CMS saving its response are handled manually rather than adding more infrastructure.

### Delivery and processing follow-up

GitHub Actions calls `/api/cron/delivery` every five minutes (:02, :07, …, :57).
One worker starts due posts across platforms, handles existing retries, and checks
Instagram containers that are ready for another poll. There are no separate slot
or Instagram-processing cron endpoints. Calendar slot times remain unchanged;
only posts due at the time of claiming are eligible. Pending container checks do not consume failure attempts.

The worker uses `CRON_SECRET`, respects `SOCIAL_DELIVERY_ENABLED`, and shares cron
logging. Follow the [GitHub setup and cutover](social-cron-github.md). Vercel's cron
list is empty. GitHub timing is best effort, and private-repository runner minutes
must be budgeted. Generation and daily token health remain separate jobs.

### Token health and renewal

A daily `/api/cron/instagram-health` job is configured at 11:00 UTC. It runs even
when delivery is disabled, verifies account access and publishing quota, and
refreshes eligible Instagram Login tokens weekly. Renewed tokens and their expiry
are saved encrypted in the service-only `instagram_credentials` table. Publishing
reads the renewed credential rather than the stale environment seed.

The initial token must be long-lived, unexpired, and old enough for Meta refresh
(at least 24 hours). A newly generated token may need its first refresh check the
following day. Short-lived tokens must first be exchanged through Meta's documented
flow; expired/revoked tokens need reconnection. No app secret or automatic initial
short-to-long-lived exchange is configured here.

Health failures and expiry warnings create CMS notifications for active publishers
and structured cron logs. A successful health check is not proof that all media
formats will publish. Neither token validity nor refresh can be guaranteed after
revocation, permission changes, or service outages.

To rotate a token, update the selected `INSTAGRAM_DEV_ACCESS_TOKEN` or `INSTAGRAM_PROD_ACCESS_TOKEN` and redeploy. The seed fingerprint
causes the app to ignore a stored token derived from an older environment seed.


### Remaining media and acceptance work

The CMS validates Storage ownership, MIME type, image alt text, and format-specific
media selection. Instagram images are checked from their actual bytes and must be
JPEG (JPG/JPEG); PNG and other image formats are rejected. Every feed/carousel
image must have an exact 4:5 displayed aspect ratio, such as 1080 × 1350. EXIF
orientation is included in the dimension check. This is the CMS feed policy;
Stories do not inherit that 4:5 restriction. Validation runs on scheduling/copying
scheduled media and again before a new Instagram container is created. The picker
and upload control check feed aspect ratio early; existing incompatible files are
not automatically cropped or converted. Image uploads and media selection throughout the CMS accept JPG/JPEG only; PNG and other image formats are excluded.
Full video metadata validation (codec, frame rate, duration, bitrate, audio) remains
unimplemented.
Perform controlled feed, carousel, Story, and Reel acceptance tests before enabling
those formats. No real post was published during the read-only credential checks.

## TikTok

### External prerequisites

- Register a TikTok developer app, add Content Posting API, enable Direct Post, obtain approval
  for `video.publish`, and have the target account authorize the app.
- Store the account's access token, refresh token, expiry, and open ID in a server-only encrypted
  integration record. The current single `TIKTOK_ACCESS_TOKEN` environment variable is suitable
  only for an initial single-account test.
- Complete TikTok's client audit. Unaudited clients are restricted to private visibility, which
  conflicts with the required `PUBLIC_TO_EVERYONE` setting.
- Verify ownership of the Supabase media domain or exact public `videos` URL prefix for
  `PULL_FROM_URL`. URLs must be HTTPS, non-redirecting, and remain accessible during transfer.

### CMS and publishing contract

1. Query creator info when presenting final publication settings and again before initialization.
2. Block publication unless `PUBLIC_TO_EVERYONE` is returned in the creator's current privacy
   options. If comments are required but the account reports comments disabled, block and explain.
3. Keep duet and stitch disabled. Record explicit publication consent with the delivery.
4. Compare video duration with `max_video_post_duration_sec` from creator info.
5. Validate MP4/MOV/WebM, supported codec, 23–60 FPS, dimensions, duration, and size before
   scheduling once media-probe metadata is available.
6. Initialize Direct Post with `PULL_FROM_URL`, persist `publish_id`, and mark the delivery
   `provider_processing`.
7. Poll the status endpoint without consuming failure attempts. `PUBLISH_COMPLETE` becomes sent;
   documented terminal states become failed; an in-progress state remains pending.
8. Treat authentication, scope, privacy mismatch, unverified URL, and invalid media as permanent.
   Retry rate limits, TikTok internal errors, and network failures.

### Remaining implementation work

- OAuth connect/callback and token-refresh flow.
- Encrypted integration storage and account connection UI.
- Creator-info preview in the post workflow.
- Media-probe metadata and duration comparison.
- Final TikTok app audit and verified Supabase URL property.

## WhatsApp

Account pairing and publisher-approved machine sending are implemented. Follow
[the WhatsApp setup and deployment notes](whatsapp-mvp.md). The sender rechecks the
publisher's active status, publishing permission, account ownership, and connected
session for each cron request. Retries already exist in the CMS; sender-side
idempotency remains unimplemented.

Instagram credentials: Vercel Production selects the `INSTAGRAM_PROD_*` pair; Preview and Development select `INSTAGRAM_DEV_*`. Outside Vercel, `NODE_ENV=production` selects PROD (including local `next start`); other modes select DEV. Missing selected credentials cause an error without falling back to the other pair or the former variable names. The encryption key and API version remain shared settings.

Set `INSTAGRAM_ENV=dev` or `INSTAGRAM_ENV=prod` for explicit server-side account selection. Restart after local configuration changes, or redeploy after changing hosted variables. If unset or blank, runtime defaults apply. The selection affects publishing, health checks, and token refresh together; queued work uses the selected account.
