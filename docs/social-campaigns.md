# Social campaigns

This document is the acceptance specification for the social campaign module.

## Campaigns and content

- A campaign is a container for related posts and may optionally link to one event. An event may have at most one campaign.
- Event behavior determines generation: a linked RRULE drives recurring proposals; campaigns do not declare a separate type.
- A campaign contains posts. Each CMS post targets exactly one platform format.
- Supported channels are Instagram Feed, Instagram Story, Instagram Reel, WhatsApp, and TikTok Reel.
- Media is selected from the approved `event-posters` or `videos` Supabase Storage buckets; the selected public HTTPS URLs are persisted with the post. The editor does not upload media. Instagram Feed supports one image or an ordered carousel of up to ten images; other formats use at most one media URL. Every Instagram image requires alt text before scheduling.
- Incomplete content may be saved as a draft, but invalid selected variants cannot be scheduled.

## Schedule

- Social publishing stores fixed UTC instants with no daylight-saving adjustment: 14:00 UTC, 19:00 UTC, and 00:00 UTC on the following day.
- The calendar and editor always display Toronto local time. These instants appear as 09:00, 14:00, and 19:00 during EST, and 10:00, 15:00, and 20:00 during EDT.
- Instagram Feed, Story, and Reel share the Instagram schedule. WhatsApp and TikTok have independent schedules.
- Two active deliveries cannot occupy the same schedule platform, posting date, and slot.
- Proposed, scheduled, due, processing, and retryable-failed deliveries reserve their slot. Drafts, cancelled deliveries, completed history, and terminal failures do not.
- Generated schedules are proposals and require user confirmation. A proposal reserves capacity but has no executable `scheduled_at` until it is confirmed.
- Confirming a delivery calculates `scheduled_at` from its posting date and named slot at the database boundary and rejects instants that are not in the future. The parent post status is derived from its delivery state.

Standalone campaigns may have no more than two occurrences in any Monday-to-Sunday week throughout the campaign lifetime. Consecutive occurrences must be at least three calendar days apart. Delivering one occurrence to multiple platforms still counts as one occurrence.

These rules are enforced for manual creation, edits, generated proposals, and direct database writes. Generation reads the same set of slot-reserving states, so a manually scheduled post immediately affects the next proposal run without rewriting schedules that were already generated.

## Event campaigns

The normal proposal contains:

| Milestone | Channels |
| --- | --- |
| Initial, at least 21 days before the event | Instagram Feed and WhatsApp |
| 14 days before | Instagram Story and WhatsApp |
| 7 days before | Instagram Story and WhatsApp |
| 2 days before | Instagram Story and WhatsApp |
| 1 day before | Instagram Story and WhatsApp |
| Event day | Instagram Story and WhatsApp |

Instagram and TikTok Reels are optional and are placed manually in available slots. A campaign created fewer than 21 days before its event receives an initial post at the earliest valid opportunity and only reminders whose milestones have not passed. Event-day deliveries must use a slot before the event begins.

One recurring campaign covers the whole series. If the series already started, campaign creation asks whether the next occurrence should receive the launch sequence. The selected launch occurrence receives the initial post and full reminder sequence. Later occurrences receive Instagram Story and WhatsApp reminders. Each later occurrence’s promotion window starts the calendar day after the preceding occurrence in Toronto time. Earlier reminder milestones are omitted, and slot allocation cannot move reminders back outside that window. Overlapping duplicate reminders are suppressed, identified, and flagged for review. RRULE exclusions receive no reminders.

Generation uses 28-day rolling coverage. A weekly generation job extends due campaigns, while campaign creation and event/RRULE changes prompt recalculation. Open-ended RRULEs keep the campaign end date null.

If an event date or recurrence rule changes, its campaign is flagged for review and a replacement future schedule may be proposed. One current review compares the event snapshot used by the accepted schedule with the latest event state; another event change replaces any unresolved proposal. Users may keep an affected post, keep all, regenerate one, or regenerate all. Sent deliveries and their content cannot be changed.

## Delivery and permissions

All deliveries are automated. Delivery records retain provider IDs, attempts, errors, and idempotency keys so each platform adapter can retry safely and notify authorized staff when delivery fails. Asynchronous Instagram/TikTok work uses `provider_processing`; status polling does not consume a failure retry.

The initial attempt and at most two retries are claimed atomically by the unified delivery job running every five minutes. Accepted asynchronous provider jobs retain their provider ID so a retry checks the existing job rather than publishing a duplicate. A terminal failure creates an in-app notification for board members and members with social-send responsibility.

| Permission | Capability |
| --- | --- |
| `social.view` | View campaigns, content, and schedules |
| `social.edit` | Create and edit campaigns, drafts, and variants |
| `social.schedule` | Confirm, reschedule, or cancel deliveries |
| `social.send` | Send or mark deliveries sent/skipped |
| `social.review` | Keep or regenerate posts affected by an event change |
| `social.delete` | Delete posts; permanently delete empty draft campaigns; archive all other campaigns |
| `social.override` | Approve exceptional campaign-policy decisions |

UI controls reflect permissions, while server actions and row-level security remain the security boundary.

Schedule generation previews are read-only. Saving regenerates from the current
event and calendar state using the existing database version checks; there is no
additional preview fingerprint protocol.


## Instagram post requirements

- Stories: one finished 9:16 JPEG (for example 1080 × 1920). The app requires this ratio at selection, upload, save, and publication. All text must already be in the image. Caption, hashtags, CTA fields, and alt text are not exposed for Stories.
- Feed: one to ten 4:5 JPEG images (for example 1080 × 1350), caption, optional comma-separated hashtags, and alt text for each image. 4:5 and required alt text are app policies.
- Reels: one MP4/MOV video, caption, and optional comma-separated hashtags. 9:16 is recommended. The storage uploader currently accepts MP4 up to 50 MB; existing MOV files can be selected. Server checks verify MIME type; Meta performs codec, bitrate, frame-rate, and duration validation. These properties are not preflighted locally.
- Instagram images are checked server-side as JPEGs up to 8 MB; the shared uploader has a stricter 5 MB limit.
- Feed/Reel hashtags are appended to the caption when the worker claims the post. Combined caption length is limited to 2,200 characters; application validation counts hashtags in both fields against 30.
- Instagram has no CTA, collaborator, overlay text, or positioning controls in this workflow. Unused post content columns are removed by migration 038.

Apply migration `038_instagram_post_requirements.sql` before deploying these changes. It removes Story caption/alt-text scheduling requirements and includes hashtags in claimed Feed/Reel captions. Existing Story images are checked against 9:16 at publication and may need replacement.

Meta sources checked November 7, 2026:
- https://www.postman.com/meta/instagram/folder/830j7my/reels-publishing (official Meta collection: MOV/MP4, HEVC/H.264, AAC, 23–60 FPS, 3 seconds–15 minutes, 9:16 recommended).
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/ (direct access returned HTTP 429; do not treat our stricter 9:16/4:5 policies as a fresh verification of all Meta image limits).


## WhatsApp post requirements and shared editor

The connected WhatsApp service uses a paired account (Baileys), not Meta's Cloud API. Its current contract is a nonempty message with zero or one JPEG poster from this project's `event-posters/public/` storage folder. Videos, carousels, separate alt text, hashtag fields, and CTA buttons are unsupported. Put URLs and any desired hashtag text directly in the message. No image aspect ratio is enforced. The editor retains its existing 2,200-character message limit and 5 MB image upload limit as app policies.

Approving a WhatsApp post records the approving user as publisher and requires that user's paired WhatsApp account. The internal title is never included in the message. The service chooses the destination group; this editor does not choose recipients.

Pending migration 038 validates WhatsApp poster paths and normalizes future saves: Story captions, Story/WhatsApp separate hashtags, and non-Feed alt text are cleared on save. It drops post `description`, `cover_media_url`, `overlay_text`, `call_to_action_link`, and `call_to_action_caption`, including stored values. The duplicate application `media_url` property is removed; ordered `media_items` is the only media transport. Campaign and event descriptions and CTA fields belong to those separate features and are retained. Do not run migrations against a database missing earlier dependencies; verify the migration history first.
