# Application responsibility boundaries

Mandatory for all new features and refactors throughout this repository:

- PostgreSQL/Supabase should filter, sort, paginate, join, and aggregate data. Select only needed columns, use parameterized query builders, and check appropriate indexes. Prefer set-based operations; SQL functions must justify their complexity.
- Server Components, Server Actions, and backend services enforce authorization, validation, business rules, orchestration, and domain transformations. Return minimal typed DTOs. Avoid N+1 queries and redundant serialization.
- Client Components own rendering, accessibility, interactions, local forms, and lightweight values derived from the displayed UI. Never download entire histories to filter, sort, aggregate, expand recurrence, or perform heavy domain calculations in the browser.
- Prefer server rendering/fetching. Introduce Client Components only where interactivity or browser APIs require them; minimize JavaScript, hydration, payloads, and redundant state.
- Choose the simplest correct execution layer. Keep library-backed or complex calculations on the backend when SQL would be less reliable or maintainable. Do not duplicate authoritative business logic across layers.
- For every change, verify query efficiency, data volume, execution location, authorization, performance, and correctness. Avoid premature optimization, unnecessary abstractions, dependencies, and schema changes.
- Identify encountered violations. Refactor those relevant to the task or explicitly authorized; explain justified exceptions briefly.

See docs/processing-boundaries.md for the application audit and verification instructions.
