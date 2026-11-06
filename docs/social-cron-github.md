# Social cron jobs on GitHub Actions

GitHub schedules authenticated GET requests to the existing production CMS routes.
Vercel still hosts the application; publishing logic and provider credentials stay
on the CMS and WhatsApp service. The Actions runner needs no Supabase or provider
credentials and performs no npm installation.

## Required setup and cutover

Migrations through 036 have been applied; **037 remains required** for Instagram
encrypted refreshed-token storage. The existing worker RPCs handle delivery.

1. Keep `SOCIAL_CRON_ENABLED` unset or `false` during cutover. Each reusable job
   checks this repository variable before starting a runner.
2. Apply `supabase/migrations/037_instagram_publishing.sql` while delivery is paused.
3. Configure production CMS Instagram variables, including
   `META_GRAPH_API_VERSION`, account ID, seed
   token, and the persistent `INSTAGRAM_TOKEN_ENCRYPTION_KEY`. Configure the
   WhatsApp service separately. Keep `SOCIAL_DELIVERY_ENABLED=false` until ready.
4. Push these files to the repository's **default branch**, and deploy that code
   to Vercel Production. `vercel.json` now has an empty cron list. Confirm the old
   Vercel schedules have been removed; disable them manually during cutover if
   they are still active before deployment finishes.
5. In GitHub → repository Settings → Secrets and variables → Actions, configure:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `CMS_BASE_URL` | Production HTTPS origin, e.g. `https://cms.example.org`, with no path |
   | Secret | `CRON_SECRET` | Exactly the same secret configured in Vercel Production |
   | Variable | `SOCIAL_CRON_ENABLED` | `true` once migration and deployment are ready |
   | Optional secret | `VERCEL_AUTOMATION_BYPASS_SECRET` | Only if Vercel deployment protection requires an automation bypass |

6. Open Actions → **CMS cron — instagram-health** → Run workflow. This may renew
   the token but never publishes a post. Verify its result and CMS notifications.
7. With delivery still disabled, manually run a delivery workflow and confirm its
   bypass warning. Review the queue, including overdue posts. Enable
   `SOCIAL_DELIVERY_ENABLED=true` in the CMS and redeploy when ready to send.
8. Verify a controlled approved post and its processing follow-up in the unified delivery worker.

The workflows do not upload local `.env.local` settings or secrets automatically.
Adding a GitHub secret does not configure that secret in Vercel, or vice versa.
No workflow runs on a normal push or pull request; activation is by schedule or
manual dispatch after the enable switch is set.

## Schedules

| Workflow / route suffix | UTC schedule |
| --- | --- |
| `delivery` | Every five minutes at :02, :07, …, :57 |
| `generation` | Monday 12:00 |
| `instagram-health` | Daily 11:00 |

The five-minute checks are offset from the top of the hour. GitHub scheduling is
best effort; delays are possible. Calendar slot instants remain unchanged; the worker picks up posts after those
instants become due, independent of the name of the slot.

The delivery workflow starts due scheduled posts across all platforms, processes
CMS-managed retries, and follows up Instagram containers. It never claims a future
post early. It respects `SOCIAL_DELIVERY_ENABLED`. Health checks run independently
of that delivery flag. Calendar morning/afternoon/evening slots remain available.

This replaces the three slot workflows and the standalone Instagram-processing
workflow. Deploy the new endpoint and push the workflow changes together during
cutover, and disable any old scheduled workflows still present on the default branch.
No new database migration is needed for consolidation; migration 037 is still
required for the Instagram implementation.

## Results and failures

Each endpoint has its own scheduled workflow and Run workflow button. All use the
shared `_social-cron.yml` job with per-endpoint concurrency and no cancellation of
an active invocation. GitHub can replace a pending queued invocation with a newer
one; the database remains responsible for atomic claims.

The dependency-free runner script makes one request, refuses redirects, imposes a
three-minute request deadline, and performs **no automatic HTTP retry**. An
ambiguous timeout may have already sent a post; inspect CMS logs before rerunning.
The existing CMS delivery retry rules remain responsible for subsequent attempts.

All three endpoints return `ok` and `summary`. HTTP failures, invalid responses,
or `ok=false` fail the workflow. The CMS sets `ok=false` for campaign errors,
terminal delivery failures, state-save errors, and unhealthy token results. Pending processing and CMS-managed retries are valid outcomes.
Delivery bypasses and skipped campaigns are warnings, not false claims of sending.
Only safe result counters are logged; upstream response bodies are not printed.

Use the GitHub run summary for counts and the Vercel runtime logs for detailed
campaign or delivery IDs. Configure your GitHub Actions notification preferences
to receive failed-run notifications. CMS delivery/Instagram-health notifications
continue independently.

## Usage and operational limits

Five-minute polling creates **8,640 delivery runs per 30-day month**, plus daily
and weekly jobs. In private repositories, check the Actions allowance and spending
budget: each short hosted-runner job can still consume a rounded billing minute.
This is not necessarily a free replacement for Vercel Pro.

GitHub schedules run from the default branch. Public-repository schedules can be
disabled after 60 days without repository activity. Keep Actions enabled, monitor
failed/missed runs, and check billing limits so they do not unexpectedly stop work.

References:
- [GitHub scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing)

## Local check

`node --check scripts/run-social-cron.mjs` checks the runner's JavaScript syntax
without triggering a production request.
