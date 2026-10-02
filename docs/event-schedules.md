# Events, schedules and recurrence rules

## Current contract

- `events` owns shared content, publication status and an optimistic version.
- `event_schedules` owns start/end, Toronto timezone, optional poster/location overrides and a nullable `recurrence_rule_id`.
- `recurrence_rule` owns the RRULE fields and `exdates`. A schedule owns its rule; rules must not be shared between schedules.
- `event_schedule_exceptions` records a source schedule, source rule, excluded local date and optional replacement schedule. It contains only explicit edits, never generated sessions.

Recurrence data has already been migrated. Migrations **030_schedule_rule_authoring.sql** and **031_schedule_campaign_generation.sql** add the new authoring and campaign operations. They perform no occurrence ETL. Migration 030 also adds the rule foreign-key column if absent; it does not populate existing data.

Old occurrence tables, views, JSON recurrence and coverage columns remain pending a separate cleanup decision. The updated application does not read or write them. Existing old SQL entry points remain for that cleanup; deploy all admin writers together. Do not run the old occurrence backfill workflow against this model.

## Calendar and dates

The calendar reads schedules with their related rules and gives them directly to FullCalendar's RRULE plugin. There is no materialization or generated-session table.

The dashboard's upcoming summary and social reminders use the RRULE library to obtain dates in memory within a bounded query window. Readers accept existing open-ended rules and rules with both limits; RRULE applies whichever limit is reached first. Campaigns separately find the first and next active dates for launch decisions. Those dates are never stored as event records. The current form retains its existing finite recurrence limits (a count or final date, up to 5,000 dates and ten years); unbounded recurrence is a separate feature.

`exdates` are `YYYY-MM-DD` original local dates in the schedule timezone. Calendar inputs combine each date with the original local start time so the exclusion matches the RRULE. Rule `until` is stored as the end of the chosen Toronto date. Local times remain fixed over DST; ambiguous/nonexistent times require correction.

## Editing

| Action | Result |
| --- | --- |
| Exclude one date | Add `exdate` and an exception record |
| Move one date | Atomically add the exclusion and a one-off replacement schedule, preserving poster/location inheritance |
| Change replacement content | Edit the replacement schedule normally |
| Restore excluded date | Remove the exclusion and exception; delete any replacement schedule |
| Remove replacement | Offer to restore its source date or leave the exclusion in place |
| Change this and following | Truncate the original rule before the date and create a new schedule; transfer following exclusions and replacement links |
| Remove schedule | Physically delete it and delete its rule when unreferenced |

Removing an original schedule leaves replacement schedules intact and removes their source exception records. Legacy rule references from `events` prevent deletion of those shared historical rule rows until the later cleanup.

Changing a tracked recurring schedule to one date requires restoring its exclusions first. Schedule forms cannot silently remove exclusions. Excluded dates can be restored from the event page even when the current pattern no longer includes them.

Mutations use permission checks, event/schedule versions, transactional writes, request IDs and the existing campaign review workflow. Retry the same payload with the same request ID. Stale edits require reload.

## Social campaigns

Campaigns remain linked to an event. Generation reads that event's current schedules and rules. After migration 033, each generated channel post stores `source_schedule_id`, the original local `source_date` and a reminder milestone. Launch selection references `launch_schedule_id` and its timestamp snapshot. Deduplication uses campaign + schedule + original local date + milestone + channel.

Schedule changes/removal flag the campaign and hold pending posts as drafts. Source identifiers survive schedule deletion to preserve history and duplicate prevention. Publishing an event does not activate its campaign; drafting or archiving the event still drafts its campaign. See [social posts](social-posts.md) for the two-table model, review behavior and coordinated cutover instructions.

## Public site follow-up

The public calendar already reads schedules and rules. Its remaining `resolved_event_occurrences` consumers (session lookup, next-session navigation and some event detail helpers) require a separate public-repository update. Public calendar exclusions must match the local start time, rather than treating date-only `exdates` as UTC instants. Do not remove the old view/table until those readers are replaced.

Permanent event links continue to use the event slug; new admin calendar inputs use schedule IDs.

## Deployment and verification

1. Apply 030 through 033 to a staging database with the already-migrated rule relationships, following the social worker cutover instructions.
2. Deploy the updated admin; verify event editing and campaign generation there before production cutover.
3. Coordinate the public-reader follow-up and review existing pending campaigns before enabling workers.
4. Discuss and perform legacy infrastructure cleanup separately.

This change has not applied migrations to the shared Supabase database.

Checks:

- `npm run test:events`: production RRULE/date validation and calendar input regression checks.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
- `npm run lint` and `npm run build`.
- In a fresh disposable PostgreSQL database whose name starts with `wmcc_event_test`, run `psql -v ON_ERROR_STOP=1 -f tests/schedule-fixture.sql -f supabase/migrations/030_schedule_rule_authoring.sql -f supabase/migrations/031_schedule_campaign_generation.sql -f tests/schedule-transactions.sql`. The fixture supplies minimal synthetic auth and proposal persistence; it is not a production-data rehearsal. Never run it against the application database.

Browser acceptance after staging migration: create/edit schedules; exclude/move/restore dates; remove replacements with both choices; split count-based and until-based rules; remove a source while retaining replacements; check inheritance, dirty forms, DST, publication permissions and the existing campaign review/proposal/delivery path.
