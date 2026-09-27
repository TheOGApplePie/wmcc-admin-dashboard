# Events, schedules and publication

## Scope

The events landing page remains a calendar with its selected-day panel. New event-specific pages manage shared details, schedules and individual sessions. An **All events** link provides access to drafts, unscheduled events and archived events. Prayer-relative timing is deferred; Hijri recurrence is out of scope.

## Code organization

- `features/events/components/`: one UI component per file. Component-local props may stay with their component.
- `features/events/hooks/`: React state/effect hooks, including mutation state and idempotent request IDs.
- `features/events/lib/`: ordinary utilities and shared form styles, without a `use client` directive or server credentials.
- Shared UI types live with their related utilities in `lib/`; `domain.ts` holds recurrence logic and domain types; `schemas.ts` holds input validation.
- `features/events/server.ts`: server-only data access. `actions/events.ts`: authorized and validated server mutations. The privileged Supabase client is also protected by `server-only`.
- `scripts/`: Node maintenance commands, outside the application client graph. They read credentials from the environment, paginate reads, report failures, and default to read-only behavior where applicable.

Keep hooks out of generic utility modules and avoid introducing client boundaries around pure helpers. Route-specific dashboard utilities live in `app/dashboard/_lib/`; social channel constants live in `features/socialCampaigns/lib/`.

## Schema contract for the public website

Apply migrations **028_event_schedules.sql** and **029_event_campaign_compatibility.sql** together with the updated admin application. They follow announcement migrations 026 and 027.

| Table/view                                        | Meaning                                                                                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`                                          | Base identity and shared content. New `publication_status` (`draft`, `published`, `archived`) and optimistic `version`. Existing rows are backfilled as published; new rows default to draft.              |
| `event_schedules`                                 | Parent `event_id`, first `start_at`/`end_at`, Toronto `time_zone`, nullable structured `recurrence`, optional poster/alt and location overrides, cancellation and version/coverage state.                  |
| `event_occurrences`                               | UUID identity, parent `schedule_id`, original local date key, generated and effective times, cancellation, supersession, explicit-override and version state.                                              |
| `resolved_event_occurrences`                      | Public/staff read view joining occurrences with base content and effective poster/location. Includes `event_id`, `schedule_id`, `publication_status`, `cancelled`, `schedule_cancelled`, and `superseded`. |
| `social_campaign_occurrences.event_occurrence_id` | Stable event-session reference, separate from the social reminder's own ID.                                                                                                                                |
| `social_campaigns.launch_occurrence_id`           | Stable launch-session reference; the legacy timestamp remains a snapshot.                                                                                                                                  |

Use the base `events.id` and `navigation_slug` for permanent event URLs. Use the occurrence UUID for a specific session. A rescheduled session retains its UUID. Different schedules can have sessions on the same date.

**Do not expand `events.recurrence_rule` or read base `start_date`/`end_date` for new schedules.** Those legacy columns and the old rule table remain for reconciliation only. They are not synchronized to the new model and cannot represent multiple schedules. New base-event date fields may be null. Old admin mutation APIs have been replaced; authenticated direct writes to legacy event/rule tables are revoked.

Example public range query (end exclusive):

```ts
const { data, error } = await supabase
  .from("resolved_event_occurrences")
  .select(
    "id,event_id,schedule_id,title,description,start_at,end_at,poster_url,poster_alt,location,navigation_slug,call_to_action_link,call_to_action_caption",
  )
  .eq("publication_status", "published")
  .eq("cancelled", false)
  .eq("schedule_cancelled", false)
  .eq("superseded", false)
  .lt("start_at", rangeEnd.toISOString())
  .gt("end_at", rangeStart.toISOString())
  .order("start_at")
  .order("id");
```

Paginate queries larger than the configured Supabase row limit. Always handle errors separately from empty results. An event detail page can exist with no upcoming sessions. Display timestamps in `America/Toronto`, including overnight sessions overlapping the requested range. Anonymous RLS exposes only published parent events; a privileged service client bypasses RLS and **must explicitly filter publication status**. Cancelled/superseded published-session records remain readable for history; the filters above exclude them from upcoming lists.

Poster inheritance is a pair: a non-null schedule URL uses its own alt text; null inherits both fields from the event. Missing images need a placeholder. Do not copy the parent URL into inheriting schedules. Stored social posts retain their snapshots until reviewed.

## Occurrence generation and editing

There is one recurrence engine, `features/events/domain.ts`. Calendar, dashboard and campaign generation read its persisted sessions rather than independently interpreting RRULEs.

For the first release schedules are **finite and completely materialized**, rather than an indefinitely extending rolling cache. This deliberately avoids coverage gaps and another cron dependency. A schedule is limited to 5,000 sessions and a ten-year span. RRULE date limits are inclusive; occurrence counts include excluded/cancelled dates. Invalid anchors and ambiguous/nonexistent DST wall times require correction instead of silent shifting. Ordinary fixed local times retain their wall-clock time over DST.

- New base events can have no schedules. Create a draft, then add one-off or recurring schedules.
- Editing a schedule preserves its original anchor unless explicitly changed. Existing overrides and completed-session timing remain intact.
- Editing one session retains its ID and changes its effective timing.
- This-and-following creates a schedule branch under the same event, retaining IDs for matching original dates. Splitting the first session updates the existing schedule.
- A changed date pattern supersedes removed future sessions. Old references remain available for review/history.
- Reset exception restores generated timing and the rule's exclusion state.
- Schedule cancellation is separate from session cancellation; restoring an individual session cannot reactivate a cancelled schedule.
- Archive preserves event and campaign history. The application refuses permanent deletion of events linked to campaigns.

Mutations are transactional and versioned. Retrying a create/save with the same request ID and payload is idempotent; reusing the ID for different changes is rejected. Stale versions require reload. Finite generation occurs before the transaction and is committed together with the schedule; a failure rolls everything back.

## Publication and social compatibility

`events.publish` is required for event publication changes. `events.edit` creates/edits drafts, content, schedules and sessions; `events.delete` controls permanent deletion. Drafts are readable by authorized event staff and social staff so they can be linked to campaigns.

- A draft event may be linked to a draft campaign.
- A campaign linked to a draft or archived event cannot activate or resume.
- Returning an event to draft, or archiving it, returns its linked campaign to draft atomically.
- Publishing an event **does not** activate its campaign. An authorized user must activate it separately.
- Existing campaign screens, proposal confirmation, provider adapters, channels and delivery history are retained.
- Generation covers all noncancelled schedules under the event and uses each session's effective poster.
- Reminder identity uses occurrence UUID plus milestone. Rescheduling does not invent a new reminder identity.
- Content, timing and poster changes open the existing campaign review workflow and invalidate generation coverage.
- Automatic delivery claims require an active campaign, a published linked event and no pending review. Standalone campaigns have no event publication dependency.
- Drafting/archiving does not erase scheduled posts, their reservations or sent history. They remain held until campaign reactivation and review resolution.
- Already in-flight provider publications cannot be recalled by a database status change. Their actual outcome is recorded; an external publication is not falsely reported as cancelled.

Legacy reminder links are reconciled by exact event ID and instant when the mapping is unique. Ambiguous upcoming reminders block new generation with an actionable error. They are not deleted or guessed. Existing duplicate base events are **not automatically merged**; reconciliation must account for campaign uniqueness and URL aliases.

## Deployment sequence

1. Obtain a schema/data backup and rehearse on a staging copy. The repository does not contain the original event-table creation migration; compare its real constraints/triggers with the assumptions above.
   Run `node scripts/preflight-event-migration.mjs` before applying migration 028. This read-only check projects legacy schedules through the production recurrence engine and reports invalid rules, missing timestamps, duplicate slugs, unmatched future reminders/launches, and reminder-key collisions. It prints counts and problem IDs, not event content or credentials. Invalid schedules, unmatched future reminders, and key collisions produce a nonzero exit code. It does not inspect database constraints/policies, replace a staging rehearsal, or automatically repair data.
2. Coordinate the public-site reader change. Old readers cannot faithfully display new multi-schedule events.
3. Pause event edits and campaign generation/delivery during cutover. Keep social delivery disabled until checks pass.
4. Apply 028 and 029 in order. New tables are populated with one schedule per legacy event; original IDs, content and publication visibility are preserved.
5. With Node 20.12+ and development dependencies installed, run `node scripts/backfill-event-occurrences.mjs`. It loads `.env.local` without logging credentials, validates all finite schedules and reports failures without writes.
6. Resolve invalid legacy schedules before proceeding. After reviewing the dry run, run `node scripts/backfill-event-occurrences.mjs --apply`. This is restartable and fills missing coverage, then links unambiguous social history.
7. Compare occurrence counts and sample sessions across DST, exclusions, overnight ranges and campaign links. Confirm all schedules have `materialized_version = version`. The admin can repair an invalid schedule on its event page; calendar failures are explicit rather than false empty results.
8. Deploy the updated admin and public readers. Verify anonymous access cannot see drafts, publication does not activate campaigns, and drafting an event drafts its campaign.
9. Resolve migration/review diagnostics, then resume workers. Verify a published campaign's proposal/approval/delivery path before enabling live delivery.

Do not roll back to the old application after new schedules have been created: its data model cannot represent them. Before writes resume, a backup rollback is possible; afterward use a forward repair or an explicit data conversion. Legacy fields should be removed only in a later migration after the public repository is updated.

This is an in-place ETL workflow: SQL copies legacy timing/rule data into schedules; the Node backfill transforms schedules into concrete sessions; the linking RPC reconciles social references. Each schedule materialization and linking RPC is transactional, but the entire backfill is not one transaction. An apply run can complete valid schedules while reporting other failures; rerunning resumes using version/coverage markers. Always complete a successful dry run first and keep workers paused until validation succeeds. The preflight does not merge events sharing a title/slug or choose which end condition to retain when a legacy rule has both count and until.

## Verification

- `npm run test:events`: domain/validation regression tests using the production TypeScript engine.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
- `npm run lint` and `npm run build`.
- `tests/events-fixture.sql` + migrations 017, 028, 029 + `tests/events-integration.sql` and `tests/events-campaign-integration.sql`: disposable PostgreSQL integration checks. The fixture refuses databases whose name does not start with `wmcc_event_test`. It is a focused schema fixture with synthetic auth/review helpers, not a substitute for a production-data rehearsal.

Run the SQL files in that order against a new empty database using `psql -v ON_ERROR_STOP=1`. Both integration suites roll back their test changes. Never apply the fixture to the application database.

Manual acceptance: preserve calendar layout at desktop/mobile widths; create an unscheduled draft; add several differently timed schedules; reset poster inheritance; edit/cancel/restore/split sessions; navigate away from dirty forms; verify failed uploads/saves and stale edits; check a viewer, editor, publisher and delete-only role; validate existing campaigns, new draft-linked campaigns and published-event reminder generation. The public repository must verify its own reader changes separately.

## Remaining release checks and limitations

The implementation has not been deployed or applied to the shared database. Browser acceptance against a migrated staging project, production-data migration rehearsal, and the separate public-site changes remain release prerequisites.

Poster uploads use unique filenames and never overwrite a campaign's stored media. Abandoned/replaced uploads are retained: automatic orphan cleanup is not implemented because existing social posts can still reference earlier posters. Any cleanup must account for both event/schedule references and social media snapshots.

The first release does not merge existing duplicate events, calculate prayer-relative times, or support unbounded recurrence. Repair invalid legacy rules and reconcile ambiguous reminder links during cutover. Existing unrelated social review/provider workflows still require their normal end-to-end staging checks; the focused SQL fixture verifies the new integration boundaries.
