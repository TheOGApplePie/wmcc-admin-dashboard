# Phase A — functional architecture review

Status: **Stage 3 implementation is in progress**, 2026-11-20. The user authorized initial implementation increments; registration table and availability, social resume hold/reconciliation, and announcement review changes exist locally and need the verification and corrections in the review. This specification supersedes the narrower proposal in `../module-readiness.md` where the two differ. The repository is on `expand-event-management-and-social-campaigns`; the earlier Phase B document is absent from this checkout, so its presence or implementation is not assumed. No Phase B ledger or event propagation is proposed. No hosted schema, Cognito account, provider account, real registration payload, or deployed scheduler was inspected.

- [Stage 2 cross-module review](stage-2-review.md)
- [Registration](registration.md)
- [Email](email.md)
- [Announcements](announcements.md)
- [Social](social.md)

These are proposals and deliberately label unknowns; neither a proposed transition nor an interface is evidence that it exists. The repository now includes focused registration, social resume and announcement reader checks and disposable fixtures; several historical docs reference absent test runners and a `tests/` directory. Implementation must restore or replace appropriate meaningful coverage rather than claim those tests ran.

## Common contract and execution rules

Each mutation takes an entity ID, expected revision, validated input and, where it could be retried across a transaction or remote handoff, an idempotency request ID. It returns a typed result: `{id, revision, state, warnings}` or a classified `validation | forbidden | not_found | conflict | dependency_unavailable | retryable | terminal | unknown_external` error. The server reauthorizes and validates each call; SQL/RLS and permission-checked RPCs protect direct access. Source-state change, approval invalidation, local protective changes and audit are atomic when they must agree. External operations follow commit and cannot be rolled back; use provider keys where supported and reconcile ambiguous outcomes before retry. A delivery acceptance is distinct from delivery confirmation. Approval covers a canonical revision; edited subject fields invalidate it atomically. Protect data access with least privilege, including authenticated staff and service-role paths.

For every screen: server fetches narrow, permission-filtered DTOs; SQL performs filtering/counting/pagination; client code handles accessible interaction and light display values. All forms provide labels, keyboard support, focus management, errors linked to fields, progress and success feedback, navigation protection for unsaved changes, and a conflict reload/reapply path. Loading, empty, invalid, saving, no-access, stale, error and recovery states are required everywhere relevant; status badges never convey meaning through color alone. Mobile controls remain operable with horizontally scrollable tables and stackable panels. Confirm destructive or irreversible actions and describe their effects. No raw provider errors, sensitive recipient data or message bodies go to general logs.

## Cross-module design review

| Topic | Decision proposed | Outstanding issue |
| --- | --- | --- |
| Approval | Announcement publication and each email communication have independently revision-bound approval; social retains its own existing consent and checks. Registration has no communication approval. | Publish permission, separation of submitter/approver and privileged migration treatment require approval. |
| Timing | Store UTC instants with explicit authoring timezone; date-only windows specify timezone and half-open boundaries. Status derived at read from approval + time where safe. | MailerLite's date-trigger UTC cutoff and plans may not match intended Toronto semantics. |
| History | Preserve submissions, sent social results, announcement content/decisions and approved communication revisions. Audit actor and action with minimal details. | Retention, legal basis, deletion/export and visibility policy require owner decision. |
| External outcome | Provider-accepted, completed, failed and unknown are distinct; ambiguous sends require reconciliation. | No provider integration until separate approval and verified sandbox. |
| Processing | SQL handles bounded queries, permissions and integrity. Versioned server actions own business rules. Existing social cron stays in place. | Confirm actual Lightsail/GitHub schedule configuration; repository documents GitHub, not deployed reality. |
| Future integration | Explicit module-specific operations; report identifiers/revisions and outcomes. No cross-module side effects introduced. | Event cancellation behavior and cross-module orchestration deferred to Phase B/C. |

## Future integration inventory

| Module | Callable operation proposed | Impact / protection / approval | Irreversibility and retained evidence |
| --- | --- | --- | --- |
| Registration | `setAvailability(eventId, revision, closed, reopenAt)` and `pageRegistrations`, `countWindow` only when trustworthy timestamps exist | Close cancels reopen atomically; event state and form visibility stay separate. | Cognito may already have accepted a submission; retain original JSON and trusted source evidence. No transfer or event trigger. |
| Email | `saveCommunication`, `submit/approveRevision`, `stageCampaign`, later provider-specific `sync/activate/deactivate` | Material content, timing, sender or audience change invalidates only affected approval; draft never sends. | Provider acceptance and activation may have already caused delivery; preserve version, provider refs and reconciliation. |
| Announcements | `saveDraft`, `submit`, `approveAndPublishOrSchedule`, `withdraw`, `republish` | Material change revokes approval and public eligibility; withdrawal protective, no communications approval. | Already viewed/cached content cannot be recalled; retain previous content and approval record. |
| Social | existing save/review/approval/campaign controls; proposed safe resume/reconcile | Existing module consent authoritative; protective pause, archive or cancel independent of communication review. | In-flight/provider-completed work cannot be recalled; retain sent IDs and attempt evidence. |

## Dependency-ordered implementation plan — approved Stage 3

1. Confirm real migrations, RLS, external writer and scheduler deployment; capture representative redacted registration shapes and benchmark full-history column discovery. Finalize retention, permissions and unresolved questions in module documents.
2. Registration: write red tests and disposable DB fixtures for dynamic columns and availability; implement event-scoped state and server table; separately coordinate website/Cognito enforcement. Do not add metadata inferred from arbitrary data.
3. Announcements: write tests for current edit-only bypass, concurrency and exact approval; agree treatment of already-public rows; ship DB authorization/state migrations and compatible public reader in a coordinated rollout; test old/new client combinations and cache boundaries.
4. Social: characterize current SQL/worker with tests, especially overdue resume and unknown outcomes; make minimal changes to recovery/claim and media-generation assumptions while retaining existing delivery machinery. Test provider processing and cron setup on staging without live sends.
5. Email: after business scope and builder decision, implement provider-independent template/campaign/communication staging and per-revision approvals with no sending. A separate provider feasibility and integration approval precedes any sync/activation work.
6. For each increment: TDD; migration tests on a fresh disposable DB; authorization, concurrency and rollback; component accessibility; `npx tsc --noEmit`, `npm run lint`, and applicable build and regression checks; record results. Cross-repo public website edits require authorized writable access and coordinated deployment.

## Stage 1 review decisions

1. **Registrations:** where is the trusted Cognito writer and can it enforce close? May real anonymized payloads and provenance be inspected? Should unknown legacy timestamp recipients be excluded and flagged? Who may access contact details?
2. **Announcements:** the user chose to keep existing live rows published and withdraw an announcement when material edits await approval. Record legacy content as grandfathered rather than inventing a human approval; Is self-approval allowed?
3. **Email:** approve a builder trial, sender and audience/consent policy, email permission matrix, and provider-managed staging boundaries. Provider selection, plan, enrollment design and activation remain a separate approval. What is the intended late-registration/date-change policy?
4. **Social:** on resume, should overdue posts be held for manual reschedule (recommended) or cancelled? What is the approved reconciliation process for unknown outcomes? Where is image generation and where is cron actually deployed?
5. Retention, audit access, timezone, accessibility and failure-response ownership must be agreed. No completion dates are assumed.

User direction: Cognito-side submission enforcement is out of scope; announcement-to-event association and linked review flags are deferred to Phase B. The preliminary email workspace is provider-free and has no sending.
