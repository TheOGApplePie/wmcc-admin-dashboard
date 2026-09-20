# Social campaigns

This document is the acceptance specification for the social campaign module.

## Campaigns and content

- A campaign is standalone, linked to one event, or linked to an entire recurring event series.
- A campaign contains posts. A post contains shared source content and one editable variant per selected channel.
- Supported channels are Instagram Feed, Instagram Story, Instagram Reel, WhatsApp, and TikTok Reel.
- Media is supplied by HTTPS URL; this module does not upload media.
- Incomplete content may be saved as a draft, but invalid selected variants cannot be scheduled.

## Schedule

- The organization timezone is `America/Toronto`.
- Each schedule platform has slots at 09:00, 14:00, and 19:00 local time.
- Instagram Feed, Story, and Reel share the Instagram schedule. WhatsApp and TikTok have independent schedules.
- Two active deliveries cannot occupy the same schedule platform, local date, and slot.
- Generated schedules are proposals and require user confirmation.

Standalone campaigns may have no more than two occurrences in any Monday-to-Sunday week throughout the campaign lifetime. Consecutive occurrences must be at least three calendar days apart. Delivering one occurrence to multiple platforms still counts as one occurrence.

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

One recurring campaign covers the whole series. The first occurrence receives the initial post and full reminder sequence. Later occurrences receive Instagram Story and WhatsApp reminders. Overlapping duplicate reminders are suppressed and the retained reminder identifies the occurrence it represents. RRULE exclusions receive no reminders, and generation uses a bounded rolling horizon.

If an event date or recurrence rule changes, its campaign is flagged for review and a replacement future schedule may be proposed. Sent deliveries and their content cannot be changed.

## Delivery and permissions

Delivery is manual initially, but delivery records support future provider IDs, attempts, errors, and idempotency keys. WhatsApp automation will be introduced first.

| Permission | Capability |
| --- | --- |
| `social.view` | View campaigns, content, and schedules |
| `social.edit` | Create and edit campaigns, drafts, and variants |
| `social.schedule` | Confirm, reschedule, or cancel deliveries |
| `social.send` | Send or mark deliveries sent/skipped |
| `social.delete` | Delete eligible drafts or archive campaigns |
| `social.override` | Approve exceptional campaign-policy decisions |

UI controls reflect permissions, while server actions and row-level security remain the security boundary.
