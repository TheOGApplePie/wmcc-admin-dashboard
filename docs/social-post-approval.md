# Post approval and archived slots

Apply `040_social_archive_slots.sql` and `041_social_post_bulk_actions.sql`
before deploying the calendar actions. Migration 040 extends the existing
campaign-change trigger: archiving cancels pending drafts, proposals, scheduled,
due and failed posts, retaining their records and releasing their reservations
through the existing slot index. It also clears pending posts on campaigns
already archived. Sent history is unchanged. In-flight/provider-processing posts
finish reconciliation; those slots are already past and cannot be chosen for a
new scheduled post. Archiving cannot recall a provider request already sent.

No archive flag, synchronization triggers or replacement slot index are added.
Migration 041 adds one transactional bulk RPC for approval, draft conversion and
deletion, reusing the existing single-post functions.

The calendar shows Draft, Proposed, and Approved statuses. Approved means the
stored `scheduled` status: publication is consented to and scheduled, rather than
already sent. Use the post-status filter to narrow the calendar.

Click a post to open its editor. Ctrl-click (or Cmd-click on Mac) toggles its
selection without opening it. Selected posts have a checkmark and outline.
Keyboard users can focus a post and use Ctrl/Cmd + Enter or Space to select it.
Changing calendar pages or filters clears the selection.

A compact action bar appears only with a selection. It offers **Open selection**
for one post, and **Convert to draft**, **Approve selected**, **Delete selected**,
and **Clear**. Actions respect the user's permissions and are disabled when any
selected post is ineligible. Select up to 100 posts per action. Unsaved previews
cannot be selected.

Approval retains the single-post content validation, publisher identity and
account requirements. Only drafts and proposals in active campaigns can be
approved, with a future date and slot and no outstanding campaign review.
Converting approved posts to drafts revokes their publication consent and releases
slots. Deletion follows existing history rules: generated posts are cancelled to
prevent regeneration, while manual posts are deleted. Sent and processing posts
cannot be deleted. All selected posts change together or none do; stale versions
and invalid selections fail the entire batch.

Run `node scripts/test-social-approval.cjs` and
`node scripts/test-instagram-requirements.cjs` for schema regression checks.

## Resuming paused campaigns

Migration `047_social_resume_hold.sql` holds scheduled and retryable-failed posts whose scheduled time has passed before a paused campaign becomes active. Overdue scheduled posts return to draft and need a new time and approval; failed posts remain failed with retries stopped and a review reason. Future posts remain scheduled. In-flight/provider-processing work is left alone so provider reconciliation can continue. The database trigger applies to every paused-to-active update, including direct authenticated updates, and runs in the same transaction as resumption. A disposable PostgreSQL fixture validates the trigger against a simplified schema; testing against the full migration chain and provider concurrency remains required before deployment.

## Interrupted delivery reconciliation

Apply migration `050_social_reconciliation.sql` after 047. An interrupted `processing` attempt and an overdue failed attempt held when resuming a campaign require reconciliation; automatic retry is disabled. A social publisher checks the provider and records evidence in the post editor, then either marks the post as sent or confirms it was not sent and returns it to draft for a new schedule and approval. Sent records retain provider IDs; returning to draft records the former provider ID and evidence in the audit log. Neither action contacts a provider. A post cannot be deleted, edited or rescheduled while its outcome requires reconciliation. Reconciliation is version-checked and requires `social.publish`. In-flight provider-processing polls are otherwise unchanged.

The manual sent timestamp records when staff confirmed the outcome; it is not necessarily the provider's original delivery time. Because external systems vary, staff must verify the provider before choosing an outcome. Campaign updates that would cancel or demote an unreconciled post require resolving it first. Tests against the complete migration chain and real provider staging remain required.

Migration `052_social_uncertain_results.sql` also holds ambiguous provider responses encountered while the worker is running, including WhatsApp request timeouts and unconfirmed acknowledgements, TikTok ambiguous retryable responses without a provider ID, and Instagram reporting a container already published. Existing provider-processing polls with a known ID continue through the existing polling path. This deliberately errs on the side of manual reconciliation; a held item is not a confirmed failed delivery.
