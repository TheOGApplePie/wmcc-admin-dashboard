# Event registrations

Open an event and select its **Registrants** tab. The admin view adapts to the submitted JSON instead of requiring a layout for each event. Each registration includes its own field labels and values; no separate form-definition JSON is required.

After the already-applied migration 045, apply `046_event_registration_table.sql` before using the updated view. Migration 046 converts existing entries transactionally; coordinate external writers before applying it. Verify the target database migration history before deployment.

`event_registrations` has one row per submission: `id` is a generated primary key, `event_id` references the parent event, and `form_data` is one JSON object. Recurring sessions share the event's collection. Migration 046 preserves each legacy array element and its ordering; an empty array produces no entries.

Example `form_data`:

```json
  {
    "Name": "Alex Example",
    "Email": "alex@example.com",
    "Contact details": {
      "Phone": "416-555-0100",
      "City": "Toronto"
    },
    "Attendees": [
      {
        "Name": "Sam Example",
        "Dietary needs": ["Vegetarian"],
        "Children": [
          { "Name": "Jo Example", "Age": 7 },
          { "Name": "Pat Example", "Age": 4 }
        ]
      },
      {
        "Name": "Lee Example",
        "Dietary needs": [],
        "Children": []
      }
    ],
    "Photography consent": false
  }
```

Display rules:

- The paginated table displays the union of top-level field labels across the entire event history, ten fields at a time. Missing values appear as a dash; nested values link readers to the full submission details. Labels are preserved exactly and sorted in database order. Selecting a registration shows its complete submitted data in a sticky side panel on desktop; on narrow screens the panel follows the list and the selection link jumps to it. Only the selected submission’s details are rendered. Selection remains scoped to the current page and uses the displayed position; the database ID is not exposed by this view.
- Primitive values display as labeled fields. Zero remains zero, booleans display as Yes/No, and missing/null/empty strings display as a dash.
- Nested objects become labeled groups. Fields may differ between events, submissions and repeated entries.
- Arrays of objects become numbered, individually collapsible entries. Repeaters may contain further groups or repeaters, such as attendees with children. Entries initially open inside the details panel so staff can read them without opening every child.
- Primitive arrays become lists, such as dietary choices or selected sessions. Mixed arrays are supported without dropping values.
- Empty arrays show “No entries”; empty objects show “No fields submitted”. Data nested twelve levels deep falls back to a scrollable JSON block so unusually deep submissions remain available without unbounded component recursion.
- Submitted text is escaped by React. The view does not interpret submitted HTML or execute it, guess a form-specific field order, or require standard name/email fields. JSONB object keys may be reordered by PostgreSQL; array entry order is preserved. A deliberate field order would need explicit ordering metadata in a future submission contract.

Migration 045 adds an invoker-security read RPC, `event_registration_page`. Migration 046 converts the legacy data, updates that reader, and adds `event_registration_table`, which discovers event field labels in SQL and returns bounded pages of labels and submissions. Both readers use an `(event_id, id)` index for ordered paging. Navigation carries a hash of the event's entry IDs and contents; if submissions change, the user is prompted to refresh. Both RPCs retain RLS and explicitly require `events.view`. An event without entries displays the empty state.

All JSON interpretation and rendering run in Server Components/backend helpers. The browser receives markup for the current page and uses native accessible disclosure controls. Label discovery and the snapshot still scan the event's entries, so their cost grows with registration history even though page payloads are bounded.

Migration 046 also provides `append_browser_event_registration(event_id, form_id, entry)` for the public website's server endpoint. It accepts only JSON objects, checks and locks the published event and its current Cognito form, and inserts one row. It is invoker-security and executable only by `service_role`; no direct browser access is granted. It does not recheck availability after Cognito submission. Existing authenticated reads require `events.view`, and deleting the parent event deletes its registrations.

Entries delivered by the browser are unverified: the RPC cannot establish that Cognito accepted them, and repeated calls create duplicate rows. Browser delivery can also be missed if the visitor leaves or loses connectivity. Staff must reconcile against Cognito; a reliable webhook integration needs verified provider identity, deduplication and recovery. The generated row ID is not a Cognito submission ID or an idempotency key.

## Verification

- `node scripts/test-registration-table.cjs`: bounded-table display values, column validation, missing and complex values. A disposable PostgreSQL fixture at `scripts/fixtures/registration-table.sql` covers full-history columns, permissions, pagination and stale snapshots; run it only against a fresh disposable database. The fixture uses a simplified permission helper, so live canonical permission and integration testing are still required.

- Historical runner (not present in this checkout): `node scripts/test-event-registrations.cjs`: arbitrary fields, nested/multiple repeaters, mixed arrays, zero/false, empty values, unusually deep data, escaped markup and invalid collection shapes. The preview regression was established failing before implementation.
- Historical runner (not present in this checkout): `node scripts/test-event-registrations-db.cjs <psql connection arguments>`: fresh disposable database only. Loads actual migrations 039/045 and canonical permission functions from migration 036; fixture DDL/data and assertions roll back. Covers page slices/order/count, nested JSON preservation, missing/empty documents, invalid bounds, anonymous grants, inactive users, explicit permission overrides, invoker security and RLS.
- `npx tsc --noEmit`, `npm run lint`, `npx next build --webpack`.

Live public-frontend submissions and a full browser acceptance pass require integration validation; they are not covered by these local fixtures.

## Availability

Migration `051_registration_availability.sql` adds event-level controls on the Registrants tab. A newly configured or replaced Cognito form defaults open; changing the form ID cancels any previous reopening schedule and advances the availability revision. Staff with `events.edit` can close it, open it, or close it until a Toronto-local reopening time; closing again clears any pending reopening. Changes are revision-checked and audited in the database. Availability is independent of publication: the public site displays its embedded form only for a published event with an eligible upcoming session and an effectively open registration setting. An expired reopen time is evaluated at read time; no cron is required. Existing registrants remain accessible.

The local public website changes check this availability, but deployment and live integration remain unverified. Hiding the embed does not close Cognito itself: direct links and previously opened forms may still accept submissions. Provider-side enforcement has not been established. Trusted submission timestamps, email fields and date-window recipients remain unimplemented until their source and provenance are verified.

`node scripts/test-public-registration-reader.cjs` checks public-reader failure handling. `scripts/fixtures/registration-availability.sql` tests the real migration against a simplified disposable PostgreSQL database, including default-open, publication, stale revisions, permissions and cancelling reopening; run it only in a fresh disposable database. Full migration-chain, cache, real Cognito and browser testing remain required.
