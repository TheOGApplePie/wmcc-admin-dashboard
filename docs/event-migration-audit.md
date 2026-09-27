# Event migration readiness check — 2026-09-25

The configured Supabase project was queried read-only through the existing service client credentials. No shared database rows, schema, or storage objects were changed. These findings are a snapshot; rerun the preflight with event edits and workers paused before cutover.

## Checks

- Repository ESLint: passed, including configured event accessibility, nested-ternary, cognitive-complexity (15), and one-component-per-file rules.
- TypeScript `--noEmit --incremental false`: passed.
- Production domain regression suite: 11 tests passed.
- Migrations 017, 028, and 029 applied to a fresh disposable PostgreSQL database with synthetic legacy one-off and recurring events. Both SQL integration suites passed.
- This was not a SonarQube scan or a migration rehearsal on a full production backup. Live database policies, triggers, and constraints still need comparison against a staging copy.

## Existing data

| Check                                           | Result |
| ----------------------------------------------- | ------ |
| Legacy events                                   | 41     |
| Schedules copied by 028                         | 41     |
| Valid schedules under the new recurrence engine | 40     |
| Sessions projected from those valid schedules   | 100    |
| Events missing legacy timestamps                | 0      |
| Existing campaigns / reminder records           | 1 / 5  |
| Unmatched future reminders                      | 0      |
| Unmatched stored launch timestamps              | 0      |
| Projected reminder-key collisions               | 0      |

**Release blocker:** event `360` has both a recurrence count and an end date. Migration 028 preserves both fields; occurrence generation rejects this combination. Choose one end condition that preserves the intended final session, then rerun preflight. The projected 100 sessions exclude this invalid event. Do not resume readers or workers with incomplete coverage.

**Existing URL ambiguity:** five duplicate-slug groups were found: `[360, 379, 385]`, `[390, 391, 392]`, `[393, 394, 395, 396, 397, 398]`, `[442, 443]`, and `[461, 462]`. Migration preserves their IDs and slugs; it does not merge them. These do not block the SQL migration, but public-site canonical URLs and any later merge need an explicit reconciliation decision.

## ETL support

1. `node scripts/preflight-event-migration.mjs`: read the legacy tables, project occurrences without writing, and report source-data problems.
2. Apply 028 and 029: preserve base IDs/content, mark existing events published, copy each legacy timing/rule into a schedule, and add occurrence/reference infrastructure. New events default to draft.
3. `node scripts/backfill-event-occurrences.mjs`: validate migrated schedules without writes.
4. `node scripts/backfill-event-occurrences.mjs --apply`: materialize sessions and link uniquely matching social references. Reruns use coverage/version markers; partial failures are reported with a nonzero exit code.
5. Verify counts, complete coverage, public visibility, and campaign behavior before resuming workers.

This workflow does not automatically repair ambiguous rules, merge duplicate events, or delete abandoned posters. Detailed cutover and public-reader requirements are in [event-schedules.md](event-schedules.md).
