# Review of migrations 039–043

These files are still untracked in this checkout and are edited as pending migration sources. If any original version has already been applied to another environment, ship its changed definitions/constraints in a new forward migration there; replaying an applied version does not upgrade that database.

- **039:** Enforce an array of JSON objects in the database, matching the existing backend parser. Keep the event primary key/FK index, staff-read RLS, and service-only writes. No JSON index: the current reader retrieves one event document and does not search JSON contents. The single-document storage remains a scaling limitation for very large events; normalizing it would change the established ingestion contract and is outside this migration review.
- **040:** Avoid first demoting and then cancelling the same pending posts when settings change during archiving. Preserve set-based cancellation, slot release, in-flight processing/history, and source identities used for generation deduplication. Reuse the existing post-update trigger for version/timestamp advancement.
- **041:** Reject missing/null/nonpositive optimistic-lock versions and malformed entries before acquiring locks. Keep ordered campaign/post locking and the maximum of 100 items. The loop deliberately calls canonical save/delete functions: replacing it with a generic bulk UPDATE would duplicate publication validation, cadence checks, permissions, and history rules. Batch failure remains atomic.
- **042:** No change. The existing timestamp trigger is reused; historical unknown modification times stay null. Adding a historical backfill would invent information. No speculative index for the library's existing backend snapshot-ordering implementation.
- **043:** Replace the per-event correlated schedule aggregate with a grouped left join. Preserve events without schedules, both recurrence definitions (multiple schedules or one recurrence rule), event/campaign eligibility, invoker security, and minimal typed fields. Keep canonical recipient permissions in the existing database helper rather than copying role logic into a new query. Keep the partial calendar-date index; add no speculative JSON/search/covering indexes without representative query plans.

Verification uses disposable PostgreSQL fixtures, the real permission functions from 036, and extracted canonical mutation/trigger functions where relevant. This does not claim a measured production speedup or hosted deployment.

## Validation

`node scripts/test-migrations-039-043.cjs <psql connection arguments>` passed against a fresh disposable PostgreSQL database. The runner extracts the existing permission helpers, slot calculation, post version trigger, publisher trigger, and canonical save/delete functions from migrations 012/021/032/036/038, then applies 039–043 in order.

Coverage: invalid JSON registration rows (including nested empty arrays), registration ACL/RLS, archived-campaign cleanup, combined archive/settings changes updating each pending post only once, preserving in-flight work and generated source IDs, normal settings invalidation, malformed/duplicate bulk inputs, stale-version rollback after an earlier delete, canonical approval/draft publisher attribution, and historical/new modification timestamps. Existing 043 recipient and option-eligibility checks also pass.

Fixture testing validates SQL behavior and contracts; it does not replace production query plans or concurrent-session load testing. No hosted migration has been run as part of this review.
