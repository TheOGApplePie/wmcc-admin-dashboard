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
