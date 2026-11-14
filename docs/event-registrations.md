# Event registrations

Open an event and select its **Registrants** tab. The admin view adapts to the submitted JSON instead of requiring a layout for each event. Each registration includes its own field labels and values; no separate form-definition JSON is required.

Apply migrations `039_event_registrations.sql` and `045_event_registration_page.sql` before using the updated view. No hosted migration is applied by this change.

`event_registrations` retains exactly two columns: `event_id` (the parent event's primary key) and `form_data` (a JSON array of registration objects). There is one row per event. Recurring sessions share that row.

Example `form_data`:

```json
[
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
]
```

Display rules:

- The paginated list previews up to two nonempty text fields per registration, using their submitted labels. Selecting a registration shows its complete submitted data in a sticky side panel on desktop; on narrow screens the panel follows the list and the selection link jumps to it. Only the selected submission’s details are rendered. Selection is scoped to the current page, can be cleared, and uses the submission’s array position rather than inventing a persistent ID.
- Primitive values display as labeled fields. Zero remains zero, booleans display as Yes/No, and missing/null/empty strings display as a dash.
- Nested objects become labeled groups. Fields may differ between events, submissions and repeated entries.
- Arrays of objects become numbered, individually collapsible entries. Repeaters may contain further groups or repeaters, such as attendees with children. Entries initially open inside the details panel so staff can read them without opening every child.
- Primitive arrays become lists, such as dietary choices or selected sessions. Mixed arrays are supported without dropping values.
- Empty arrays show “No entries”; empty objects show “No fields submitted”. Data nested twelve levels deep falls back to a scrollable JSON block so unusually deep submissions remain available without unbounded component recursion.
- Submitted text is escaped by React. The view does not interpret submitted HTML or execute it, guess a form-specific field order, or require standard name/email fields. JSONB object keys may be reordered by PostgreSQL; array entry order is preserved. A deliberate field order would need explicit ordering metadata in a future submission contract.

Migration 045 adds a narrow invoker-security read RPC, `event_registration_page`. PostgreSQL returns the total count and only the requested slice (25 registrations per page; RPC maximum 100). It uses the existing event primary-key lookup, retains RLS, and explicitly requires `events.view`. No additional index, table or schema for individual form fields is introduced. An absent document or empty array displays the empty state. Out-of-range pages provide navigation back to the first page.

All JSON interpretation and rendering run in Server Components/backend helpers. The browser receives markup for the current page and uses native accessible disclosure controls; no client parser, form-layout library or dependency is added. The current single-document storage still requires PostgreSQL to read that document and traverse JSON for pagination. This bounds data sent to Next.js and the browser; it is not a claim of constant-cost reads for arbitrarily large event documents.

Submission handling remains separate. The public frontend should submit through its trusted backend, which validates and persists submissions; this admin change does not add a submission endpoint or grant anonymous/direct browser writes. Existing authenticated reads require `events.view`, and deleting the parent event deletes its registrations. External writers must preserve the JSON-object-array contract and handle concurrent submissions atomically.

## Verification

- `node scripts/test-event-registrations.cjs`: arbitrary fields, nested/multiple repeaters, mixed arrays, zero/false, empty values, unusually deep data, escaped markup and invalid collection shapes. The preview regression was established failing before implementation.
- `node scripts/test-event-registrations-db.cjs <psql connection arguments>`: fresh disposable database only. Loads actual migrations 039/045 and canonical permission functions from migration 036; fixture DDL/data and assertions roll back. Covers page slices/order/count, nested JSON preservation, missing/empty documents, invalid bounds, anonymous grants, inactive users, explicit permission overrides, invoker security and RLS.
- `npx tsc --noEmit`, `npm run lint`, `npx next build --webpack`.

Live public-frontend submissions and a full browser acceptance pass require integration validation; they are not covered by these local fixtures.
