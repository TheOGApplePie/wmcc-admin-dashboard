# Social permissions

The social permission matrix is **View, Edit, Publish, Delete**.

- `social.edit`: create campaigns and draft posts; edit content and proposed publication dates. Editing scheduled content returns affected pending posts to draft and clears publication consent. Editing active campaign event links, publication dates, channels or generation settings returns the campaign to draft.
- `social.publish`: activate/pause/resume campaigns, approve scheduled publishing, and resolve publishing reviews/exceptions. Scheduling is authorization for the worker to publish later.
- `social.delete`: existing delete/archive controls.
- `social.view`: existing read access.

Publishing content through the post editor still requires Edit as well as Publish because that operation also saves content. Campaign lifecycle actions require Publish. Sent and in-flight posts cannot be edited.

## Migration 032

Apply `032_social_publish_permission.sql` before deploying the corresponding app changes. It consolidates effective Schedule or Send permission into Publish, preserving an explicit existing `social.publish` override. A user denied both old permissions stays denied. Review/Override alone does not grant publishing. Board retains full access; Management defaults to publishing and General defaults to editing.

The database maps old `has_perm('social', 'schedule'|'send'|'review'|'override')` calls to `social.publish` so existing RPCs and RLS policies enforce the canonical permission during the later schema consolidation. `get_my_access()` and the permission editor expose only the four new keys.

Migration 033 completes the [two-table consolidation](social-posts.md). Both migrations have been tested locally, not applied to shared Supabase. Deploy the current app with both migrations.

## Tests

- `npm run test:permissions` checks the application permission matrix and overrides.
- Create a fresh disposable PostgreSQL database named `wmcc_event_test...`, then run `psql -v ON_ERROR_STOP=1 -f tests/social-permissions-fixture.sql -f supabase/migrations/032_social_publish_permission.sql -f tests/social-permissions.sql`. The fixture uses synthetic auth and selected production table/trigger definitions; it is not a production backup rehearsal.
- TypeScript, ESLint and the production build check the application changes. Browser acceptance against a migrated staging database remains necessary before deployment.
