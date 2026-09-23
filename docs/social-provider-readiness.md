# Social provider readiness

Scheduling is provider-independent. Keep `SOCIAL_DELIVERY_ENABLED=false` until a provider's
account, credentials, validation, and manual acceptance cases are complete.

## Instagram

### Account and authentication

- Use an Instagram professional account and a Meta app configured for the selected Instagram
  login model.
- Obtain the content-publishing permission/scope required by that login model and a renewable,
  server-accessible token. Do not depend on an interactive administrator session at cron time.
- Configure the Graph API version and Instagram account ID.
- Confirm Page Publishing Authorization if the connected account requires it.
- Check content-publishing quota before enabling production batches.

### Required publishing state machine

1. Validate caption, media count, public URL, and media properties before scheduling.
2. Create child containers for carousel items, then the carousel parent container; otherwise
   create one image, Story, or Reel container.
3. Persist the returned parent container ID immediately. Containers expire if they are not
   published within 24 hours.
4. Mark the delivery `provider_processing`; this is not a failed attempt.
5. On the next worker run, query the container's `status_code`.
6. `IN_PROGRESS`: retain the ID and poll later. `FINISHED`: call `media_publish` exactly once.
   `ERROR` or `EXPIRED`: mark terminal and notify. `PUBLISHED`: reconcile as sent.
7. Persist the published media ID and, where available, retrieve its permalink.

The adapter implements this parent-container lifecycle. Carousel child creation is not yet
resumable independently: if parent creation fails after children are created, a retry may create
new child containers. Add provider-state JSON if this becomes operationally significant.

### Media preflight still required

Storage currently provides MIME type and byte size. Full readiness also requires inspecting
image dimensions and video codec, dimensions, frame rate, duration, audio codec, and bitrate.
That metadata should be captured when files enter Storage or by a trusted media-probe worker;
do not download and probe large videos inside a Vercel cron invocation.

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

Deferred. A cron request has no administrator cookies, so it cannot recover a scheduling user's
Supabase access token at delivery time. The endpoint must adopt a renewable server-to-server
credential or another explicit machine-authentication contract before its adapter is enabled.
