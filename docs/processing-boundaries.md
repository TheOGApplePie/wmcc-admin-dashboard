# Application data-processing audit

The application follows database filtering and aggregation → server orchestration and DTOs → interactive rendering. `AGENTS.md` makes this an application-wide development requirement.

| Area | Processing and delivery |
| --- | --- |
| Events calendar | Validated date window reaches the database. Future schedule anchors and expired one-off schedules are excluded in SQL. RRULE expansion, exclusions, Toronto DST, overlap checks, and chronological ordering run in the server-only domain module. The browser receives concrete dated events and renders them. |
| Event editing | Form shape validation is shared for immediate feedback. Authoritative recurrence validation, selected-date membership, and remaining split count run on the server. Mutations retain permission checks, optimistic versions, request IDs, and the existing transactional database function. |
| Event library | Database search/status filters and narrow event metadata; backend recurrence library computes globally ordered next occurrences, snapshot validation, cursor comparison, and a minimal display page. See the exception below. |
| Registrations | Invoker-security SQL RPC authorizes and pages the existing event JSON document (25 submissions per page). Server Components render arbitrary labeled fields, nested groups and repeaters; native disclosure controls handle expansion without client parsing. See [event registrations](event-registrations.md) and migration 045. |
| Social calendar | Database filters by visible dates, campaign, campaign status, platform, and post status. Queries select named columns and pages of at most 200 rows. The client requests subsequent pages only within the visible window, rejects obsolete requests, and displays loading/error states. |
| Campaign list and selected posts | Database ordering, status filtering, and pagination. Campaign summaries exclude snapshots and nested event schedules. Selected-campaign posts load independently, including unscheduled drafts, with paging controls. |
| Copy targets | Database restricts eligible campaign, source exclusion, lifecycle status, and future approved posts. Publishing capability is read server-side. Targets are paginated; the transactional copy function still validates every submitted target. |
| Social post mutations | Server validates business rules/media and returns a freshly read UI DTO. Client replacement no longer reconstructs authoritative status, review flags, version, or schedule timestamps. |
| Campaign options | SQL joins event/campaign eligibility and calculates recurrence flags; the server returns only typed option fields. Active assignees come from profile IDs/emails rather than auth-admin user records. |
| Generation and delivery | Backend libraries handle proposal/slot calculations. Occupancy filtering runs in SQL. Generation cron reads stable ID batches against one due-time cutoff. Delivery uses existing bounded transactional claim RPCs. |
| Cron notification recipients | One service-role-only SQL function inserts notifications with set-based selection using the canonical database permission helper, eliminating duplicated permission evaluation and recipient downloads. |
| Notifications | Server-rendered history pages; user-scoped SQL count and pagination, stable ordering, named columns. Bell requests five rows. Login toast uses an exact overdue count plus five assignment bodies. |
| Team | Server-rendered database search/pagination, stable ordering, and database counts. Current viewer identity is independent of the displayed roster page. Permission editing remains interactive; mutations enforce permissions server-side. |
| Announcements | SQL groups current/scheduled/expired rows. Scheduled and expired history are paginated with navigation. The complete active rotation is fetched in database pages for its reorderable form and preview. |
| Feedback | Existing database search/count/date filtering and pagination, now with validated page limits, Toronto day boundaries with an exclusive next-day upper bound, ISO timestamp parameters, and stable ordering. |
| Storage | Storage API searches the folder before pagination. The server filters compatible MIME types within each 60-object storage page. The browser renders accumulated results and maintains ordered selection. Pagination advances by the raw page size even when type filtering removes entries. |
| Access/authentication/navigation | Server resolves current access and enforces action permissions. Client access checks control presentation and interaction, never replace authorization. |

## Deliberate execution choices

- RRULE calculations remain in the established server recurrence library. Reimplementing Toronto recurrence, DST, exclusions, and splitting in SQL would introduce a second authoritative implementation.
- The event library retains backend snapshot-based global ordering. Next-occurrence order requires library calculations across eligible schedules, and its existing cursor contract invalidates a list after any matching event changes. It reads narrow metadata and bounded database pages, sends only the requested display page, and preserves the existing global ordering/cursor regression suite. This remains O(matching events/schedules) server work per library request. Moving date-based library sorting to SQL with an equivalent snapshot contract is a possible future optimization, not a claim that this path is constant-cost.
- The complete **active** announcement rotation is the value of one reorderable form and carousel preview. Historical/scheduled records are paginated separately. Drag-and-drop updates to the displayed form stay local until the server validates and persists the complete order.
- Dropdown catalogs contain only eligible option fields, fetched in database pages; they are needed to render the event/assignee selectors. They are not complete event/profile/auth-user records. Extremely large catalogs would benefit from server search comboboxes.
- Calendar selection, selected-day filtering within an already fetched window, local checkbox choices, unsaved proposal previews, MIME presentation, image dimension previews, and formatting are UI-derived values. They do not determine authoritative publication, authorization, or recurrence.
- Storage's public listing API cannot apply MIME predicates, so the backend filters each bounded listing page. A page can contain no compatible media while still exposing Load more.

See [campaign platform defaults](social-platform-defaults.md) for migration 044, selective copy behavior, approval invalidation and its regression checks.

## Deployment and verification

Apply `supabase/migrations/043_processing_boundaries.sql` before deploying the code. It adds two narrowly scoped SQL functions and an index for date-filtered calendar reads. Publisher notification insertion is service-role-only. Event option reads are invoker-security and explicitly require `social.edit`; existing RLS remains in effect.

Checks:

- `npx tsc --noEmit`
- `npm run lint`
- `node scripts/test-processing-boundaries.cjs` — backend recurrence, DST, exclusions, SQL range pushdown, concrete calendar DTOs, query bounds, and database failures.
- `node scripts/test-event-library.cjs` — ordering/filter/cursor behavior, including recurring schedules.
- `node scripts/test-social-approval.cjs`
- `node scripts/test-instagram-requirements.cjs`
- `node scripts/test-processing-boundaries-db.cjs <psql connection arguments>` — run only against a fresh disposable database; loads the actual canonical permission functions from migration 036, then validates migration 043 grants, recipients, overrides, inactive-user denial, and event eligibility.
- `npm run build`

The existing event-library UI and event-workspace UI runners require `jsdom`, which is not declared/installed in this workspace. No new dependencies are introduced by this refactor. Hosted database plans, real data volumes, browser interaction, and production latency require deployment/integration validation; source-level query inspection is not a measured performance benchmark.

## Results for this refactor

TypeScript, ESLint, the processing-boundary runner, the event-library runner, social approval checks, Instagram/WhatsApp requirement checks, and `next build --webpack` passed. Migration 043 passed its disposable PostgreSQL fixture tests using the actual permission functions from migration 036. The default Turbopack build stalled; the webpack production build completed. UI runners remain unavailable because `jsdom` is missing. Migration 043 has not been applied to a hosted database.
