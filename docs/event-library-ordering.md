# Event library sorting

## Deployment and timestamp findings

Apply `042_event_updated_at.sql` before deploying this library. Live schema
inspection found `events.created_at` (non-null timestamptz) and no modification
timestamp or event update-stamping trigger. Creation times are read as persisted.
The migration adds nullable `updated_at` and reuses the existing
`set_social_updated_at()` function to stamp INSERT/UPDATE with `now()`. Existing rows stay null until modified: their historical
update times cannot be reconstructed honestly. They sort after known update times
and display “Update time unknown”. The trigger does not change `created_at`.

Existing `mutate_event` already increments the parent event's `version` for
schedule/exception/removal operations. Those are existing parent-row modifications
and therefore advance the new timestamp too. No new schedule-to-event propagation
is introduced. Direct schedule changes that do not modify the event record do not
advance the event timestamp. Event content and publication changes update the
parent record and are stamped normally.

The new migration was tested in a disposable local PostgreSQL database; it has
not been applied to shared Supabase by this task.

## Ordering

The URL carries `sort=next_occurrence|created_at|updated_at`, along with search `q`
and publication `status`. Unknown sort values use next occurrence. Changing a
select immediately navigates without Apply, reconstructs the URL without old page
parameters, empties the client collection and invalidates in-flight load requests.
The route keys the client by normalized filters, so new filters start at page one.
History and refresh restore selection through App Router search parameters.

- Next occurrence: earliest future valid start across non-cancelled schedules,
  ascending; no future start last; event ID ascending as final tie-breaker.
- Date created: persisted creation timestamp descending, then event ID ascending.
- Last updated: persisted update timestamp descending, unknown times last, then
  event ID ascending.

Next occurrence reuses `nextScheduleDate`, which evaluates the existing RRULE
semantics and skips exdates without a fixed look-ahead horizon. Replacement and
split schedules are normal candidate schedules; truncated sources and excluded
original dates retain their existing domain representation. Cancelled schedules
are ignored. No initial schedule date is substituted for a future occurrence.
Backend cursor/recurrence comparisons use Temporal instants to preserve
sub-millisecond ordering. Created/updated ordering uses PostgreSQL timestamps directly.

## Cursor and infinite scrolling

Every server request authenticates and checks `events.view`; reads use the user's
RLS-aware Supabase client. Persisted timestamp ordering runs in PostgreSQL, with nulls last and ID as the
final key. Recurrence ordering runs in backend-only code before taking a 30-item
page. The source fingerprint still scans matching metadata to detect changes. Infinite scrolling has a native Load more/Retry button fallback.

The versioned cursor includes sort, normalized search/status filters, one reference
time for the collection, a SHA-256 fingerprint of the authorized source rows, and
the last timestamp/null group plus event ID. Cursors are rejected across different
sort/filter configurations. The null group is encoded by a null timestamp and
compared before the final ID key. Continuations retain the original reference
time for one hour, then restart. An exact source fingerprint and anchor check
prevent mixing pages after edits, removals or additions. If the source collection
changes, the client replaces its loaded rows with a fresh first page instead of
continuing a now-invalid ordering. This is not a database MVCC snapshot held open
across HTTP requests.

Stale client responses are ignored using a request generation invalidated on
navigation and unmount. Next.js owns competing route navigations. There is no
client-side resorting of an already paginated subset.

## Performance limitation

The existing schema has no indexed, recurrence-aware next-occurrence key. At the
inspected size (35 events, 53 schedules), the server reads filtered event metadata
in bounded database batches and computes a global recurrence-aware order. Schedule
queries are bounded to 100 event IDs per filter and 500 rows per database page.
All modes load schedules so cards can display the next session and schedule kind. No occurrence tables, materialization jobs,
shared caches, Redis or SQL RRULE implementation are added.

This strategy does O(number of matching events + schedules) source work per
next-occurrence page, plus recurrence evaluation; timestamp modes read matching event metadata in PostgreSQL timestamp order and evaluate schedules for card summaries. It is deliberately sized
for this library, rather than claimed as an indexed large-catalog strategy.
At substantially greater scale, an authorized snapshot/index design would need
separate evaluation. Existing malformed recurrence data follows the domain helper's
validation errors rather than being silently assigned a fabricated date.

## Verification

- `node scripts/test-event-library.cjs`: global ordering and multi-page continuity
  for all modes, default/fallback, filters, URL round-trips, fixed reference time,
  fractional timestamp precision, null/equal-key ordering, cursor configuration and
  expiry, collection changes, RRULEs, exclusions, cancelled schedules, replacements,
  split schedules, exhausted rules and empty/end-of-results states.
- `NODE_PATH=/tmp/wmcc-event-workspace-tests/node_modules node scripts/test-event-library-ui.cjs`:
  native select navigation and filter preservation, immediate collection reset,
  stale response rejection before route remount, infinite scrolling after sort
  changes, end-of-results, invalid-snapshot restart, and selection restoration from
  route props as used by refresh and Back/Forward.
- `psql -v ON_ERROR_STOP=1 -d <empty-disposable-db> -f scripts/test-event-updated-at.sql`:
  actual PostgreSQL trigger behavior, unknown historical updates, new inserts,
  content modifications and existing parent-version update semantics. This script
  creates a fixture table and must only run against an empty disposable database.

The DOM suite uses jsdom installed under `/tmp`, following the event-workspace test
setup; no project dependencies were added. Route/history restoration is tested at
the React/router boundary, not by driving a real browser. Supabase runtime queries
use mocked query results in pagination tests; the timestamp trigger test uses real
local PostgreSQL. No production records were modified.

Verification results: TypeScript, scoped ESLint, both library regression suites,
the existing workspace DOM regression suite, the local PostgreSQL timestamp test,
and `npm run build -- --webpack` passed. No real-browser history/viewport checks
were run. The disposable database used the standard Supabase anon/authenticated
roles; a plain PostgreSQL cluster needs those role fixtures for the migration test.

## Database / backend / UI boundary

The database owns authorization policies, filtering, stored timestamps, timestamp
ordering and transactional post mutations. The backend owns RRULE evaluation,
cursor validation, collection consistency and presentation transforms. Those
modules explicitly import `server-only`. Lightweight URL/filter helpers and types
are separate; the UI does not import the recurrence engine, Temporal, cursor
validation or server date formatting through its library helpers.

The library response contains event ID, title, publication status, base poster URL/alt, formatted date labels and a schedule-kind label per row, plus collection/cursor metadata. Raw schedule/rule data and
sorting timestamps stay on the backend. The frontend renders this response and
handles navigation, selected filters, loading state and stale-request protection.
No additional database functions, indexes, tables, dependencies or services were
introduced for this separation.

## Poster card redesign (November 2026)

The task owner explicitly approved retaining the existing backend global scan for this redesign. This is a temporary performance exception, not an indexed next-occurrence solution. No migrations, indexes, dependencies or recurrence engine changes were introduced. The existing 30-row page contract is retained. Database reads retain RLS, title ILIKE/status predicates, bounded projections, 100-ID schedule batches and 500-row database pages. There are no per-card queries. Real query plans and hosted performance were not measured.

Changed responsibilities:

- `app/dashboard/events/library/page.tsx`: authorized server-rendered initial page and `events.edit`-gated creation link using the existing `/dashboard/events/new` workflow.
- `app/dashboard/events/library/loading.tsx`: reserved poster/card skeletons. Initial failures retain the parent events error boundary and Retry action.
- `features/events/components/EventLibraryCard.tsx`: responsive, reserved 3:4 poster space, object-contain image, meaningful alt text, unavailable-image fallback, publication text, schedule kind, Toronto next-session label and semantic management link. Next Image is unoptimized to follow direct Storage image delivery and gracefully handle existing HTTPS poster hosts without changing global host configuration; images retain native lazy loading. No schedule poster is inferred.
- `features/events/components/EventLibraryClient.tsx`: one/two/three-column grid, 350ms debounced search using URL replacement, status/sort navigation, separate empty/no-match messages, clear-filter link, existing IntersectionObserver/manual pagination and retry.
- `features/events/library/filters.ts` and `server.ts`: narrow poster/summary DTO additions and safe non-string search handling. All sorts now evaluate schedules so every card shows its next session. Existing `display_date` stays in the response for compatibility.
- `scripts/test-event-library.cjs` and `scripts/test-event-library-ui.cjs`: executable backend/card and DOM regressions. DOM tests use the pre-existing jsdom installation under `/tmp`; no dependency is added.

### Engineering Insight

Recurrence-aware cursor keys depend on the earliest valid future date across all applicable schedules, rather than a persisted event timestamp. The existing server RRULE helper skips exclusions without an arbitrary short horizon; cancelled schedules are omitted, replacements are independent schedules, and split source rules retain their truncation. Null future dates sort last, with ID breaking ties. A fixed reference instant and source fingerprint prevent mixing orders across pages; changed/expired collections restart instead of continuing through shifted boundaries. The fingerprint is not a transactional database snapshot, so concurrent changes during the individual source reads remain an existing limitation.

The database filters authorized records; server-only recurrence and cursor modules compute authoritative summaries; the browser renders cards and manages forms/observation. Request-generation checks reject obsolete pagination responses, a synchronous in-flight guard blocks duplicate loads, pending search blocks old-filter pagination, and timer/observer cleanup handles navigation and unmount. Failed increments preserve cards and require manual retry, preventing automatic failure loops. No focus is moved on append.

Reference guidance consulted: [Next Image](https://nextjs.org/docs/app/api-reference/components/image), [React effect cleanup](https://react.dev/reference/react/useEffect), [Supabase ILIKE](https://supabase.com/docs/reference/javascript/ilike), and [Tailwind grid columns](https://tailwindcss.com/docs/grid-template-columns).

Verification for the redesign is recorded in the task response; earlier sections describe prior verification and must not be read as a new claim that missing historical runners were executed. Real-browser viewport, history, keyboard and hosted authorization checks remain deployment acceptance work.

Redesign verification: `npx tsc --noEmit`, `npm run lint`, `node scripts/test-event-library.cjs`, `NODE_PATH=/tmp/wmcc-event-workspace-tests/node_modules node scripts/test-event-library-ui.cjs`, and `npm run build -- --webpack` passed. Scoped lint also passed after the final test additions. Backend tests include permission denial before retrieval and hidden creation UI without edit permission; these mock the permission boundary and do not substitute for hosted RLS integration tests.

## Configurable ordering follow-up

All three existing options remain available in the native Sort by select, without Apply. Cards now show Created/Updated labels in those respective modes, using the server-formatted persisted value; unknown historical modifications remain explicitly unknown. The default, ascending upcoming order and descending persisted timestamp orders are unchanged. Sort changes retain q/status, reset the collection/cursor, invalidate requests and use App Router history; invalid sort values normalize to next occurrence. No new infrastructure or schema changes were needed; the previously approved source-scan exception still applies.

Expanded `test-event-library.cjs` covers multi-page global ordering for all three modes, ties across page boundaries, microsecond precision, nullable modification dates, no-upcoming events, fixed reference instants, filter/URL round-trips, and cross-mode cursor rejection. The query mock now applies PostgreSQL-style ordering before database range limits rather than ignoring order calls. Expanded DOM tests cover sort selection, preserving filters, clearing collection/cursor, stale response rejection, continuing infinite loading after sorting, and normalized URL props as restored by refresh and Back/Forward. They do not drive a real browser history stack.

`node scripts/test-event-updated-at.cjs` creates and removes its own synthetic local PostgreSQL cluster with TCP disabled. It loads the canonical timestamp function from migration 012 and actual migration 042, verifying inserted/modified timestamps, historical null values, unchanged creation dates, direct schedule-write isolation and the parent version update used by existing mutate_event schedule operations (migration 033). It passed after allowing PostgreSQL shared memory outside the sandbox. No shared database was accessed or migrated. Live deployment of 042 remains a deployment prerequisite; no generated database type file exists in this checkout, and field inspection used the existing query contracts, schema migrations and recorded prior schema findings.
