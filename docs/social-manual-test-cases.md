# Social campaign manual acceptance tests

Run this checklist in a non-production Supabase project after migrations `020`, `021`, and
`022`. Use test Instagram and TikTok accounts. Keep `SOCIAL_DELIVERY_ENABLED=false` until the
scheduling sections pass.

Record the tester, date, environment, observed result, and evidence link for every case.

## Roles and permissions

| ID | Test | Expected result |
|---|---|---|
| PERM-01 | Sign in with only `social.view`; open campaigns, calendar, and a post. | Content is readable. No create, edit, delete, review-verdict, schedule, or Storage-picker control is usable. |
| PERM-02 | Invoke the Storage-list action as a view-only user. | Server returns `social.edit` permission denied. |
| PERM-03 | Sign in with `social.edit` but not `social.schedule`; create and edit a draft. | Draft saves; scheduling and unscheduling an existing scheduled post are denied. |
| PERM-04 | Sign in with `social.schedule`; schedule and reschedule a post. | Both operations succeed when constraints pass. |
| PERM-05 | Attempt a review verdict without `social.review`, then as a board member. | First attempt is denied; board-member verdict succeeds. |

## Campaign CRUD

| ID | Test | Expected result |
|---|---|---|
| CAM-01 | Create a standalone draft campaign with start/end dates. | Campaign appears in the recent-first list and settings page. |
| CAM-02 | Edit name, description, dates, defaults, assignee, generation setting, and status. | Saved values survive refresh; inactive assignees are rejected. |
| CAM-03 | Link an event that already has a campaign. | Database rejects the duplicate event relationship. |
| CAM-04 | Delete an empty draft campaign. | Campaign is permanently removed. |
| CAM-05 | Delete a campaign containing posts. | Campaign is archived; historical records remain. |

## Media and content validation

| ID | Test | Expected result |
|---|---|---|
| MEDIA-01 | Browse Storage as an editor. | Only `event-posters` and `videos` are available; folders and pagination work. |
| MEDIA-02 | Select 1–10 Feed images and reorder them. | Order and matching alt text survive save and refresh. |
| MEDIA-03 | Change Feed/Story to Reel/TikTok after selecting images. | Incompatible image selection and alt text are cleared. |
| MEDIA-04 | Change Reel/TikTok to Feed/Story after selecting a video. | Incompatible video selection is cleared. |
| MEDIA-05 | Schedule Feed/Story without alt text. | Client and server reject scheduling; draft remains allowed. |
| MEDIA-06 | Tamper with a request using an external URL, missing object, wrong bucket, or wrong MIME type. | Server rejects scheduling before any record is partially updated. |
| MEDIA-07 | Schedule WhatsApp with caption only. | Scheduling succeeds without media. |

## Scheduling invariants

| ID | Test | Expected result |
|---|---|---|
| SCH-01 | Schedule Instagram Feed and Story in the same date/slot. | Second delivery is rejected because Instagram formats share capacity. |
| SCH-02 | Schedule Instagram and WhatsApp in the same date/slot. | Both succeed because platforms have independent capacity. |
| SCH-03 | Save a scheduled delivery as draft, refresh, then use its former slot. | Draft has no date/slot and disappears from the calendar; former slot is available. |
| SCH-04 | Schedule a post in a past UTC instant or an already-passed current-day slot. | Scheduling is rejected. |
| SCH-05 | Schedule outside campaign start/end dates. | Scheduling is rejected by PostgreSQL. |
| SCH-06 | Use three distinct dates in one Monday–Sunday week for a standalone campaign. | Third date is rejected. |
| SCH-07 | Use standalone dates fewer than three calendar days apart. | Later operation is rejected. |
| SCH-08 | Distribute a standalone occurrence to multiple platforms on the same date. | All platform deliveries are allowed; the date counts once. |
| SCH-09 | Open two sessions and schedule the same platform/date/slot concurrently. | Exactly one transaction succeeds. |
| SCH-10 | View winter and summer schedules. | Stored instants remain 14:00Z/19:00Z/00:00Z-next-day; Toronto display changes between EST and EDT. |

## Generated proposals and recurrence

| ID | Test | Expected result |
|---|---|---|
| GEN-01 | Generate a first-occurrence event campaign at least 21 days out. | Initial Feed + WhatsApp and 14/7/2/1/0-day Story + WhatsApp proposals appear. |
| GEN-02 | Generate fewer than 21 days before the event. | Initial post is compressed to the earliest valid date; passed milestones are omitted. |
| GEN-03 | Generate later occurrences of a recurring event. | Later occurrences receive reminders only. |
| GEN-04 | Generate an RRULE with exclusions. | Excluded occurrences receive no proposals. |
| GEN-05 | Generate an open-ended RRULE repeatedly. | Coverage advances without adding a campaign end date or duplicating generation keys. |
| GEN-06 | Fill every valid slot for one milestone, then generate. | Other channels persist normally; the unplaceable channel is suppressed and shown in review instead of failing the transaction. |
| GEN-07 | Generate again without advancing or changing anything. | No duplicate occurrences, posts, variants, or deliveries are created. |
| GEN-08 | Confirm one channel of a multi-channel proposal. | Occurrence remains proposed until every channel is scheduled. |
| GEN-09 | Confirm all channels, then return one to draft. | Occurrence becomes confirmed, then returns to proposed; the draft releases its slot. |
| GEN-10 | Change event timing/RRULE twice before review. | One open review reflects only the latest event state; sent posts remain unchanged. |
| GEN-11 | Exercise keep-one, keep-all, regenerate-one, and regenerate-all. | Decisions require `social.review`; only mutable future content changes. |

## Cron, retries, and recovery

| ID | Test | Expected result |
|---|---|---|
| CRON-01 | Call each delivery route without `CRON_SECRET`. | HTTP 401; no records change. |
| CRON-02 | Call with valid secret and `SOCIAL_DELIVERY_ENABLED=false`. | HTTP 200 bypass response; no delivery is claimed. |
| CRON-03 | Enable delivery and make provider return a retryable morning failure. | Attempt becomes failed/retryable and is claimed by the afternoon worker. |
| CRON-04 | Fail three attempts. | Delivery becomes terminal, releases future capacity, and authorized recipients get one actionable notification. |
| CRON-05 | Stop a worker after it claims a delivery; wait over 30 minutes. | Next cron recovers it from `processing`; attempts below three retry, final attempts become terminal. |
| CRON-06 | Start two cron requests concurrently. | `SKIP LOCKED` prevents the same delivery being claimed twice. |
| CRON-07 | Return a permanent provider validation/authentication error. | No retry is scheduled; notification identifies the delivery. |

## Instagram acceptance

| ID | Test | Expected result |
|---|---|---|
| IG-01 | Publish one image, a carousel, and a Story using public Storage URLs. | Container creation, readiness, and publication complete; provider ID is stored. |
| IG-02 | Publish a Reel. | Video container ID is stored, later status polling reaches `FINISHED`, then the container is published within 24 hours. |
| IG-03 | Force container `ERROR` or `EXPIRED`. | Delivery becomes terminal with the provider message and is not recreated automatically. |
| IG-04 | Return a transient Meta/HTTP failure. | Delivery retries without creating a duplicate container when an external container ID exists. |
| IG-05 | Use invalid dimensions, format, size, or inaccessible URL. | CMS preflight rejects known-invalid media; remaining provider rejection is terminal and actionable. |

## TikTok acceptance

| ID | Test | Expected result |
|---|---|---|
| TT-01 | Connect an audited app/account with `video.publish`; query creator info. | CMS uses the current privacy and interaction options returned by TikTok. |
| TT-02 | Account does not offer `PUBLIC_TO_EVERYONE`. | CMS blocks scheduling/publishing and explains that public API posting is unavailable. |
| TT-03 | Publish an MP4 from the verified Supabase URL/domain. | Initialization returns a publish ID; polling reaches `PUBLISH_COMPLETE`. |
| TT-04 | Use an unverified or redirecting media URL. | CMS/provider rejects it without repeated blind retries. |
| TT-05 | Video exceeds creator duration or TikTok format/dimension/frame-rate limits. | Preflight rejects it before scheduling where metadata is available. |
| TT-06 | TikTok remains processing across a worker run. | Publish ID is retained and status is polled; no duplicate initialization occurs. |

## Sign-off

Scheduling may be released when PERM, CAM, MEDIA, SCH, and GEN cases pass. Enable one provider
at a time only after its provider cases and CRON cases pass. Keep WhatsApp disabled until its
server-to-server authentication and payload contract are finalized.
