# Event management workspace

## Routes and ownership

`/dashboard/events/[eventId]` is Overview; `/registrants` remains the registrants
route. The shared App Router layout owns the event title, publication badge,
lifecycle actions, URL-backed navigation and contextual campaign link. Navigation
uses ordinary links with `aria-current="page"`, not a client-side tab widget.
Authorization remains server-side. `readEventWorkspace` uses React request caching
so the layout and page share event/schedule/campaign reads. Registrants retain
their existing JSON renderer and read permission; campaign management stays in
`/dashboard/posts`. Events without campaigns retain the existing Social Posts
link rather than getting a new campaign-creation flow.

Overview owns the active schedule editor. `BaseEventForm` is always mounted.
A single editor state covers creation, card editing, individual-date changes and
splitting. Card editors unmount on close/switch, while the independent details
form stays mounted. The event-version key that previously remounted the entire
manager is removed. Successful schedule saves finish their refresh before closing.
Exceptions remain below the schedule list, with their actions blocked while a
schedule editor is open. Removal confirmations retain their existing behavior.

## Form lifecycle

Forms use DOM-value snapshots rather than touched flags. Snapshots trim text,
normalize numeric values and zero seconds in datetime-local values, compare
multi-value controls without depending on checkbox click order, exclude inactive
CTA fieldsets, and include disabled inputs so submission cannot falsely change
dirty state. Controlled recurrence selectors, weekday/position selections and
poster hidden values participate in the snapshot. Each form has its own baseline.

Save uses the existing schemas, safe actions, request IDs and optimistic versions.
Errors preserve input and dirty state. Successful saves commit only that form's
baseline. Cancel resets details to current persisted props, including poster and
CTA controls; cancelling a schedule closes its editor. Details Save is disabled
while clean. Schedule Save is disabled while clean for existing non-split editors;
creation/splitting can save their configured defaults. Read-only users receive
disabled detail fields and no schedule editing controls.

A schedule editor retains its opening version. Details detect changed shared
content after a refresh and ask the user to Cancel/reload current values rather
than silently applying local input against an unrelated writer's new version.
Changes to event version/publication alone do not invalidate shared content;
this allows independent schedule saves while editing details. Database version
checks remain authoritative for changes not yet visible in refreshed props.

## Navigation and discard protection

The dashboard-level guard registry combines details, schedule and mutation state.
It has no document-click listener and does not patch history. Workspace links,
dashboard sidebar links, notification links and sign-out explicitly use this guard.
Guarded links use Next.js `onNavigate`; modified/new-tab clicks retain native Link
behavior. Route transitions consider both dirty forms, while schedule switching
or cancellation considers only the outgoing schedule. Lifecycle actions retain
their original confirmations and publication permissions and then consult the
all-form discard guard. Mutation and refresh state blocks competing mutations,
navigation and discard confirmation. Route navigation uses a React transition to
keep controls blocked while the destination loads.

The native `dialog.showModal()` confirmation uses the requested title/message,
a safe initial focus on Keep editing, Escape cancellation, destructive styling,
and focus restoration to a connected initiating element. Native modal dialogs
provide browser focus containment and background inertness. The DOM test shim
checks opening, labels, initial focus, Escape, and focus restoration, but does
**not** validate browser-native focus trapping or screen-reader announcements.

Browser limitations: `beforeunload` requests native confirmation for dirty or
pending work on refresh/tab closure/full document navigation, subject to browser
support and activation requirements. Same-document browser Back/Forward is **not
reliably interceptable** through App Router's Link API and is not claimed as
protected. Clean URL navigation, refresh selection and history routing use normal
App Router behavior. No global event interception or history sentinel entries are
introduced. Browser-native warning text cannot be customized.

References: [Next.js Link onNavigate](https://nextjs.org/docs/app/api-reference/components/link#onnavigate).

## Files

- `app/dashboard/events/[eventId]/layout.tsx`, `page.tsx`, `loading.tsx`, and
  `registrants/page.tsx`: shared workspace shell and existing route content.
- `features/events/workspace.ts` and `components/EventWorkspaceHeader.tsx`:
  shared authorized reads, route navigation, header/lifecycle/campaign controls.
- `EventManager`, `EventActions`, `BaseEventForm`, `ScheduleCard`, `ScheduleForm`,
  `ScheduleDateForm`, `PosterFields`: immediate details, card-local editing,
  mutation coordination and existing-field tracking.
- `features/events/hooks/useTrackedForm.ts` and `lib/formSnapshot.ts`: per-form
  baselines and normalized comparison.
- `features/navigation/UnsavedChangesProvider.tsx`: explicit navigation guard
  and discard dialog. Dashboard layout/sidebar, notifications, sign-out and
  new-event back navigation wire into it.
- `scripts/test-event-workspace.cjs`: focused DOM regression runner.

No database schema, server-action contract, recurrence persistence, publication
state or campaign activation rule changes are part of this refactor.

## Verification

The workspace test uses real React components, hooks and DOM events with mocked
server actions/router. It checks immediate fields, explicit saves, dirty reversion,
Cancel baselines, independent dirty forms, clean/dirty editor switching, Keep and
Discard, dialog Escape/focus restoration, save failure input retention, mutation
blocking, read-only controls, route/campaign targets, stale refreshed content,
recurrence indexing, split initialization and split submission payloads.
It is not an end-to-end test against Supabase or a real browser.

The repository uses standalone CommonJS regression scripts. For this DOM suite,
install jsdom into a temporary directory (no project dependency changes):

```sh
npm install --prefix /tmp/wmcc-event-workspace-tests --no-save --package-lock=false jsdom@26
NODE_PATH=/tmp/wmcc-event-workspace-tests/node_modules node scripts/test-event-workspace.cjs
```

Also run TypeScript, scoped ESLint, existing social/Instagram regression scripts,
and a production build. Real-browser mobile/desktop inspection and native dialog
Tab/Shift+Tab containment remain manual checks when browser tooling is available.

## Engineering Insight

A server refresh and a form reset are different operations. Stable component
identity preserves local edits across refreshed server props; a separate persisted
baseline lets Save/Cancel and optimistic locking remain correct without a page-wide
remount. URL-backed views belong to the router, while the single active schedule
editor and independent form drafts belong to the workspace and individual forms.

### Results for this refactor

- `npx tsc --noEmit`: passed.
- Scoped ESLint across event/navigation components, route files and affected
  dashboard navigation: passed.
- `NODE_PATH=/tmp/wmcc-event-workspace-tests/node_modules node scripts/test-event-workspace.cjs`: passed.
- `node scripts/test-social-approval.cjs`: passed.
- `node scripts/test-instagram-requirements.cjs`: passed.
- `npm run build -- --webpack`: passed, including route generation.
- Default Turbopack build remained at compilation without a result and was
  stopped before using webpack; no Turbopack success is claimed.
- `git diff --check`: passed.
- No real-browser viewport or native focus-trap verification was available.
