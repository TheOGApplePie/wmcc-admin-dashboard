# RPC removal audit — November 12, 2026

## Scope and result

Read-only inspection of the configured Supabase database found **38 public functions**. The audit compared live definitions, function signatures, trigger bindings, PostgreSQL dependencies (including policies), current repository RPC calls and SQL function-body references. It also searched other database schemas for calls to the removal candidate. No `cron.job` table is installed in this database. No database objects were changed.

**One unused removal candidate: `public.materialize_event_schedule(uuid, integer, jsonb)`. The other 37 have live dependencies, but two of those can be consolidated rather than retained as separate functions. The timestamp helper is now intentionally reused by pending migration 042.** This is a source/dependency audit, not proof of zero traffic from services outside this repository.

## Removal candidate

`materialize_event_schedule(uuid, integer, jsonb)` is the legacy occurrence materializer from migration 028. Its old caller was the migration-028 version of `mutate_event`; the live replacement delegates scheduling to `mutate_schedule_internal` and no longer calls it. There are no current app callers, live function callers in public or other schemas, trigger bindings, or catalog dependents. Its executable roles are the owner and `service_role`.

The current schedule contract explicitly avoids occurrence materialization: see [event schedules](event-schedules.md). The old backfill scripts referenced by [the historical migration audit](event-migration-audit.md) are absent from this checkout. Confirm that no independently deployed legacy ETL/backfill worker still calls the RPC before removing it. The database catalog cannot prove the absence of an external service-role caller.

After that check, a new forward migration can contain:

```sql
DROP FUNCTION public.materialize_event_schedule(uuid, integer, jsonb);
```

Use the explicit signature and the default `RESTRICT` behavior. Do not use `CASCADE`. This recommendation does not include dropping `event_occurrences` or its views: the schedule documentation still records public-site consumers needing a separate review.

## Second-pass findings: consolidation opportunities

A fresh read-only catalog query returned the same 38 functions. Twelve are trigger
functions, not ordinary application RPC endpoints; the remaining 26 include both
external RPCs and internal SQL helpers. Having a trigger binding proves that a
function is in use, but does not prove that its behavior needs a separate function.
The first pass was too categorical about keeping every bound function separately.

| Function that could be removed | Required change first | Assessment |
| --- | --- | --- |
| `set_social_updated_at()` | Keep as a shared timestamp function. | The original audit found only its campaign binding. Revised migration 042 reuses it for events too, avoiding a new stamp function. Do not consolidate it away when deploying these migrations. |
| `guard_self_access_change()` | Move all self-role, override, and status protections into `guard_profile_permission_update()`, before its early-return branches, then remove `trg_guard_self_access`. | Removes a separate profile trigger without removing a security rule. Preserve the invited-to-active exception and the current service-role behavior. Requires permission regression checks. |
| `guard_campaign_event_publication()` | Fold the published-linked-event check into the campaign publication guard, then remove `campaign_event_publication`. | Possible, but less attractive: preserve INSERT and UPDATE coverage, row locking, security context, and trigger ordering. In particular, the existing campaign permission guard returns early for service-role calls; the event-publication check currently still runs for those calls and must continue to do so. |

These are **refactoring candidates**, not unused functions that can be dropped
unchanged. None were modified or dropped during either audit. The other live
functions still implement required behavior; no additional unreferenced function
was found on the second pass. The materializer remains conditional on checking
external legacy callers.

## Live inventory

| Function signature | Decision | Evidence / reason |
| --- | --- | --- |
| `acknowledge_social_campaign(uuid,integer)` | Keep | Campaign review: `actions/socialCampaigns.ts`. |
| `claim_social_posts(integer)` | Keep | Publishing worker: `app/api/cron/_cronHandler.ts`. |
| `claim_whatsapp_account(text)` | Keep | External WhatsApp sender contract: `docs/whatsapp-mvp.md` (pairing). |
| `complete_social_delivery_attempt(uuid,boolean,text,text,text,boolean)` | Keep | Publishing worker completion: `app/api/cron/_cronHandler.ts`. |
| `copy_social_post_details(uuid,uuid,jsonb,jsonb)` | Keep | Copy post details: `actions/socialCampaigns.ts`. |
| `delete_social_post(uuid)` | Keep | Post deletion: `actions/socialCampaigns.ts`; pending bulk RPC also calls it. |
| `delete_unused_schedule_rule(bigint)` | Keep | Called by `mutate_schedule_internal`, `remove_schedule_internal`. |
| `event_publication_campaign_sync()` | Keep | Bound trigger: `events.event_publication_campaign_sync`. |
| `get_my_access()` | Keep | Access bootstrap: `features/access/server.ts`. |
| `get_whatsapp_publisher(uuid)` | Keep | External WhatsApp sender contract: `docs/whatsapp-mvp.md` (publisher resolution). |
| `guard_campaign_event_publication()` | Consolidate first | Bound trigger: `social_campaigns.campaign_event_publication`. |
| `guard_last_board()` | Keep | Bound trigger: `profiles.trg_guard_last_board`. |
| `guard_profile_permission_update()` | Keep | Bound trigger: `profiles.trg_guard_profile_permission_update`. |
| `guard_self_access_change()` | Consolidate first | Bound trigger: `profiles.trg_guard_self_access`. |
| `guard_social_campaign_publication()` | Keep | Bound trigger: `social_campaigns.a_social_campaign_publication_permission`. |
| `guard_social_post_publisher()` | Keep | Bound trigger: `social_posts.social_post_publisher`. |
| `has_perm(text,text)` | Keep | App permission checks and row-level security policies. Called by `acknowledge_social_campaign`, `claim_whatsapp_account`, `copy_social_post_details`, `delete_social_post`, `get_my_access`, `guard_profile_permission_update`, `guard_social_campaign_publication`, `guard_social_post_publisher`, `mutate_event`, `persist_schedule_campaign_proposals`, `reorder_announcements`, `save_social_post`, `social_campaign_change`. |
| `has_permission_for_user(uuid,text,text)` | Keep | Called by `get_whatsapp_publisher`, `has_perm`. |
| `is_active_board()` | Keep | Used by `policy profiles_delete on table profiles`, `policy profiles_insert on table profiles`. |
| `mark_social_delivery_provider_processing(uuid,text,text)` | Keep | Publishing worker: `app/api/cron/_cronHandler.ts`. |
| `materialize_event_schedule(uuid,integer,jsonb)` | Candidate | Legacy materialization workflow; no current callers or catalog dependents. Check external ETL first. |
| `mutate_event(text,jsonb,uuid)` | Keep | Event mutations: `actions/events.ts`. |
| `mutate_schedule_internal(bigint,text,jsonb)` | Keep | Called by `mutate_event`. |
| `open_current_social_campaign_review(bigint,text,jsonb)` | Keep | Called by `mutate_event`, `preserve_social_campaigns_before_event_delete`. |
| `persist_schedule_campaign_proposals(uuid,integer,integer,jsonb,jsonb,date,uuid,timestamp with time zone,boolean)` | Keep | Campaign generation: `features/socialCampaigns/generation/runCampaignGeneration.ts`. |
| `preserve_social_campaigns_before_event_delete()` | Keep | Bound trigger: `events.social_campaign_event_delete`. |
| `recover_stuck_social_posts(timestamp with time zone)` | Keep | Worker recovery: `app/api/cron/_cronHandler.ts`. |
| `release_whatsapp_account()` | Keep | Account unlinking: `actions/whatsapp.ts`. |
| `remove_schedule_internal(uuid,boolean)` | Keep | Called by `mutate_schedule_internal`. |
| `reorder_announcements(bigint[])` | Keep | Announcement ordering: `features/announcements/actions.ts`. |
| `save_social_post(uuid,integer,uuid,text,text,text[],text[],text[],social_post_channel,text,date,time_slot)` | Keep | Create/update/approval: `actions/socialCampaigns.ts`; pending bulk RPCs also call it. |
| `set_social_updated_at()` | Keep shared | Bound trigger: `social_campaigns.social_campaigns_updated_at`. |
| `social_campaign_change()` | Keep | Bound trigger: `social_campaigns.social_campaign_change`. |
| `social_event_snapshot(bigint)` | Keep | Called by `open_current_social_campaign_review`, `preserve_social_campaigns_before_event_delete`. |
| `social_slot_scheduled_at(date,time_slot)` | Keep | Called by `save_social_post`. |
| `stamp_joined_at()` | Keep | Bound trigger: `profiles.trg_stamp_joined_at`. |
| `touch_social_post()` | Keep | Bound trigger: `social_posts.social_posts_updated`. |
| `write_schedule_rule(jsonb,text)` | Keep | Called by `mutate_schedule_internal`. |

## Easy-to-misidentify functions

- `is_active_board()` has no local app call but is required by the live `profiles_insert` and `profiles_delete` policies. It is present in the live database even though its creation is not recorded in this migration set.
- `set_social_updated_at()` still backs the `social_campaigns_updated_at` trigger.
- `guard_campaign_event_publication()` and `guard_social_campaign_publication()` both have live bindings. The former checks linked-event publication; the latter enforces campaign permissions and transitions. They are not interchangeable.
- `preserve_social_campaigns_before_event_delete()` still backs the event-delete trigger. The app RPC refusing linked-event deletion does not make direct-database deletion protection redundant.
- `write_schedule_rule`, `delete_unused_schedule_rule`, `remove_schedule_internal`, and `mutate_schedule_internal` are internal mutation helpers, not unused client RPCs.
- `social_event_snapshot`, `social_slot_scheduled_at`, `open_current_social_campaign_review`, and `has_permission_for_user` are called inside live database functions.
- `claim_whatsapp_account` and `get_whatsapp_publisher` belong to the external sender contract; searching only `.rpc(...)` calls in this repository would miss them.

## Already removed legacy RPCs

Migration 032 already removed the old delivery/variant workflow functions. Examples absent from the live catalog are `claim_social_deliveries`, `recover_stuck_social_deliveries`, `create_manual_social_post`, `update_social_delivery_post`, `delete_social_delivery_post`, `resolve_social_campaign_review`, `persist_social_campaign_proposals`, `persist_event_campaign_proposals`, and `link_legacy_event_campaign_occurrences`. No extra removal is needed for them. Keep historical migrations intact.

Some names were dropped and recreated with current implementations, including `complete_social_delivery_attempt`, `mark_social_delivery_provider_processing`, and `persist_schedule_campaign_proposals`. Their legacy history is not a reason to remove their live replacements.

## Pending local functions (revised after the KISS review)

Unapplied migrations 039–042 were simplified in place. They add just one RPC:
`bulk_social_post_action(jsonb,text)`, shared by approval, draft conversion and
deletion. The earlier separate approval RPC, archive-state functions and event
stamp function were removed before deployment. Archive handling extends the
existing `social_campaign_change()` trigger function; event timestamp tracking
reuses `set_social_updated_at()`. The latter therefore gains a second binding
after migration 042, and must not be removed based on its original campaign-only
binding without updating event timestamp tracking as well.
