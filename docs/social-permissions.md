# Social permissions

The social permission matrix is **View, Edit, Publish, Delete**.

- `social.edit`: create campaigns and draft posts; edit content and proposed publication dates. Editing scheduled content returns affected pending posts to draft and clears publication consent. Editing active campaign event links, publication dates, channels or generation settings returns the campaign to draft.
- `social.publish`: activate/pause/resume campaigns, approve scheduled publishing, and resolve publishing reviews/exceptions. Scheduling is authorization for the worker to publish later.
- `social.delete`: existing delete/archive controls.
- `social.view`: existing read access.

Publishing content through the post editor still requires Edit as well as Publish because that operation also saves content. Campaign lifecycle actions require Publish. Sent and in-flight posts cannot be edited.

## Migration 032

Apply `032_social_posts_consolidation.sql` before deploying the corresponding app changes. It consolidates effective Schedule or Send permission into Publish, preserving an explicit existing `social.publish` override. A user denied both old permissions stays denied. Review/Override alone does not grant publishing. Board retains full access; Management defaults to publishing and General defaults to editing.

The database maps old `has_perm('social', 'schedule'|'send'|'review'|'override')` calls to `social.publish` so existing RPCs and RLS policies enforce the canonical permission during the consolidated migration. `get_my_access()` and the permission editor expose only the four new keys.

The same migration performs the [two-table consolidation](social-posts.md). The former unapplied permission-only 032 and table-only 033 migrations have been replaced by this single transaction. Deploy it with the current app; the separate Cognito event change is now migration 033. Neither migration has been applied to shared Supabase.

## Tests

- The [social migration tests](social-posts.md#local-tests) verify permission migration and post approval against the consolidated schema.
- TypeScript, ESLint and the production build check the application changes. Browser acceptance against a migrated staging database remains necessary before deployment.
