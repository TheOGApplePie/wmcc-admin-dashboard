# Social campaigns and posts

Migration `033_social_posts_consolidation.sql` reduces the social model from seven tables to two:

- `social_campaigns`: event link, campaign status, defaults, generation coverage, launch selection and review state.
- `social_posts`: one publication to one channel, including its content, proposed date, approved publication time, status, assignment and provider result.

It removes `social_campaign_occurrences`, `social_post_variants`, `social_deliveries`, `social_campaign_reviews` and `social_post_review_items`. The editor, dashboard, generation and publishing worker all use the two remaining tables. There are no compatibility views or dual writes.

## Post fields

Content has separate columns: `title`, `caption`, `description`, `hashtags`, `media_urls`, `media_alt_texts`, `cover_media_url`, `overlay_text`, `call_to_action_link` and `call_to_action_caption`. Media URLs and alt text are ordered PostgreSQL arrays with matching lengths. There are no JSON columns on posts. RPC transport and provider requests may assemble JSON without storing content in a JSON column.

`channel` identifies the publication format. `scheduled_date` and `time_slot` can be proposed on drafts. `scheduled_at` is populated on approval. Status tracks draft, proposed, scheduled, due, processing, provider processing, sent, failed, skipped or cancelled. Existing fixed UTC slot times are unchanged.

Provider identifiers, error, attempt count, retry timing and a stable idempotency key live on the post. The worker claims rows with `FOR UPDATE SKIP LOCKED`; channel outcomes remain independent. Polling an asynchronous provider result does not consume a retry and can finish even if the campaign is subsequently held.

Generated posts store `source_schedule_id`, `source_date` (the original local event date) and `reminder_milestone`. A unique constraint on those fields plus campaign and channel prevents repeated generation from creating duplicates. Source identifiers survive schedule deletion for history and deduplication; the generation RPC validates the schedule/event relationship for new proposals. No event sessions are stored.

## Permissions and review

Editors create campaigns and draft or modify posts. Publishing requires `social.publish`; saving content and approving it together requires both Edit and Publish. Post writes go through permission-checked RPCs, with a version check to reject stale edits. Authenticated clients cannot bypass approval with direct table writes.

Changing approved content returns the post to draft and removes consent. Changing campaign event links, dates or channels holds pending posts for review. Event/schedule changes flag the campaign and hold its pending posts. A publisher acknowledges the campaign changes, then approves each affected post after reviewing its content and timing. Acknowledgment does not automatically approve posts. Reviews and generation suppression details use the existing `audit_logs` table.

Generated posts are cancelled when removed from the calendar, retaining their identity so generation cannot recreate them. Manual drafts can be deleted. Sent and in-flight publication history cannot be deleted; a campaign containing posts must be archived instead of deleted.

## Cutover

1. Apply migrations 030–032 first if they have not already been applied.
2. Pause generation and new publishing. Let in-flight provider publications finish, then pause the publishing worker and admin writes.
3. Back up the database and apply migration 033 alongside the matching app deployment. The old app and worker are incompatible with the consolidated schema.
4. Verify the calendar, post editor, campaign review and generation against the migrated staging database before enabling the worker.

The migration copies each channel publication, including channel drafts without a delivery row. Existing delivery IDs become post IDs; draft variants without deliveries keep their variant IDs. Ordered media, sent history and retry keys are retained. Existing approved non-TikTok posts retain their scheduling approval; an unknown approver remains null. TikTok still requires its recorded explicit consent. Legacy review records and identifier mappings are archived in `audit_logs`.

Preflight aborts safely if publications are in flight, posts lack campaigns/channels, or future generated reminders lack source references. Resolve those records before retrying. Duplicate source identities or unexpected database dependencies also abort the transaction instead of silently discarding records. Older event-occurrence references are used only during this migration when already present; runtime generation uses schedules and RRULE.

This migration has not been applied to shared Supabase. Browser acceptance against a migrated staging database and real provider publication remain deployment checks.

## Local tests

- `npm run test:social`, `npm run test:events`, `npm run test:permissions`
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- `npm run lint` and `npm run build`

In a fresh disposable PostgreSQL database named `wmcc_event_test...`:

```sh
psql -v ON_ERROR_STOP=1 -f tests/social-consolidation-fixture.sql -f tests/social-consolidation-seed.sql -f supabase/migrations/033_social_posts_consolidation.sql -f tests/social-consolidation.sql
```

The fixture runs the actual legacy social migrations with synthetic Supabase auth and base tables. Tests cover populated conversion, approval permissions, stale edits, per-channel deduplication, review holds, provider retries/polling, and schedule deletion preserving post history. Never run these fixtures on the application database.
