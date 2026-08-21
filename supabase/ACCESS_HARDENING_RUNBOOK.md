# Access hardening deployment

Migrations `010`–`012` are historical. For an environment where `012` has
already run, apply the forward migrations in order:

1. `013_permission_boundary.sql`
2. `014_access_api.sql`
3. `015_audit_hardening.sql`

Apply them to staging first. Migration 013 intentionally replaces every RLS
policy on `profiles`, `events`, `recurrence_rule`, `social_posts`,
`announcements`, and `community-feedback` so an unknown permissive policy cannot
survive. Events and announcements retain intentional public read access;
feedback retains intentional public insert access.

Before applying 013, capture the current state:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

After applying all three migrations, verify:

```sql
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles', 'events', 'recurrence_rule', 'social_posts',
    'announcements', 'community-feedback', 'audit_logs'
  )
order by tablename, cmd, policyname;

select routine_schema, routine_name, security_type
from information_schema.routines
where routine_schema in ('public', 'private')
  and routine_name in (
    'has_perm', 'is_active_board', 'get_my_access',
    'get_team_roster', 'get_social_assignees',
    'record_profile_activity', 'audit_row_change'
  )
order by routine_schema, routine_name;

select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name like 'audit_%'
order by event_object_table;
```

Manual staging verification should cover Board, Management, General, invited,
inactive, missing-profile, granted-override, and revoked-override accounts.
Confirm both direct URL behavior and direct Supabase table/RPC access. Automated
authorization and RLS coverage remains intentionally deferred to the dedicated
test PR (`TODO(tests-pr)` in migration 012).
