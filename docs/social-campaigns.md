# Social campaigns

This document is the acceptance specification for the social campaign module.

## Campaigns and content

- A campaign is a container for related posts and may optionally link to one event. An event may have at most one campaign.
- Event behavior determines generation: a linked RRULE drives recurring proposals; campaigns do not declare a separate type.
- A campaign contains posts. Each CMS post targets exactly one platform format.
- Supported channels are Instagram Feed, Instagram Story, Instagram Reel, WhatsApp, and TikTok Reel.
- Media is supplied by HTTPS URL; this module does not upload media. Instagram Feed supports one image or an ordered carousel of up to ten images; other formats use at most one media URL. Every Instagram image requires alt text before scheduling.
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

One recurring campaign covers the whole series. If the series already started, campaign creation asks whether the next occurrence should receive the launch sequence. The selected launch occurrence receives the initial post and full reminder sequence. Later occurrences receive Instagram Story and WhatsApp reminders. Overlapping duplicate reminders are suppressed, identified, and flagged for review. RRULE exclusions receive no reminders.

Generation uses 28-day rolling coverage. A weekly generation job extends due campaigns, while campaign creation and event/RRULE changes prompt recalculation. Open-ended RRULEs keep the campaign end date null.

If an event date or recurrence rule changes, its campaign is flagged for review and a replacement future schedule may be proposed. One current review compares the event snapshot used by the accepted schedule with the latest event state; another event change replaces any unresolved proposal. Users may keep an affected post, keep all, regenerate one, or regenerate all. Sent deliveries and their content cannot be changed.

## Delivery and permissions

All deliveries are automated. Delivery records retain provider IDs, attempts, errors, and idempotency keys so each platform adapter can retry safely and notify authorized staff when delivery fails.

The initial attempt and at most two retries are claimed atomically by the three daily delivery jobs. Accepted asynchronous provider jobs retain their provider ID so a retry checks the existing job rather than publishing a duplicate. A terminal failure creates an in-app notification for board members and members with social-send responsibility.

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
