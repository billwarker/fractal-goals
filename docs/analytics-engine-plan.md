# S+ Analytics Engine Plan

## Summary

Build a user-wide, semantic analytics engine with a console-first query editor, auto-suggested charts, saved query profiles, live cached execution, and a typed registry architecture. Core analytics charts should be rewritten onto the engine in v1 rather than left as parallel handcrafted implementations.

## Current-State Audit

- Analytics is split across handcrafted backend services, frontend visualizations, graph profiles, and saved dashboard layout JSON.
- Security is strong per route/service, but not yet centralized as a reusable analytics query policy layer.
- Existing dashboards save layout state, not reusable query definitions.
- The S+ gap is a single governed engine that powers console queries, chart profiles, dashboards, and future analytics surfaces without duplicate implementations.

## Core Architecture

- Add a backend analytics semantic layer exposing datasets such as sessions, completed activities, goal evidence, targets, notes, programs, templates, metrics, and event logs using user-facing names and consistent business rules.
- Add an engineer-owned dataset registry with typed dataset definitions, fields, joins, filters, aggregations, default sort, soft-delete behavior, tenant policy, and chart affordances.
- Add a structured query spec compiler, not raw SQL. Every query injects tenant policy:
  - `owner_id == current_user.id` for owned roots/goals.
  - `root_id IN owned_root_ids` for root-scoped objects.
  - Join-through policies for metric values, junction tables, and other indirect objects.
- Add saved query profiles:
  - user-wide by default
  - optional root/fractal filters
  - versioned `query_spec`
  - `visualization_spec`
  - soft delete
- Keep dashboard layout persistence, but migrate dashboard windows to reference query profiles or inline query specs.

## APIs And Data Contracts

- Add:
  - `GET /api/analytics/catalog`
  - `POST /api/analytics/query/run`
  - `GET /api/analytics/query-profiles`
  - `POST /api/analytics/query-profiles`
  - `PATCH /api/analytics/query-profiles/<id>`
  - `DELETE /api/analytics/query-profiles/<id>`
- Query execution returns:
  - normalized columns
  - rows
  - inferred chart suggestions
  - execution metadata: duration, row count, cache hit, truncation/limit status
- Query specs must include a schema version and be validated before persistence and before execution.

## Performance, Caching, And Observability

- Target sub-5s rich interactive queries.
- Default row limit: `500`; hard cap: `5000`.
- Use live execution with short query-result caching keyed by tenant, query spec hash, and relevant root filter.
- Invalidate query cache from the existing event bus when sessions, goals, activities, targets, notes, programs, templates, or metrics change.
- Log query usage, duration, row count, cache hit/miss, validation errors, execution errors, and slow queries without storing result data.

## Frontend UX

- Build a console-first analytics surface:
  - dataset picker
  - structured query controls
  - result preview table
  - auto chart suggestions
  - save/update query profile
  - insert profile into dashboard window
- Keep power-user flow fast, but avoid raw JSON as the main authoring experience.
- Rewrite core dashboard charts to use query-backed profiles so existing analytics and the new console share one engine.
- Retire old chart/data paths as each equivalent lands to avoid competing implementations.

## Migration And Modularity

- Introduce the engine behind existing analytics routes without breaking saved dashboards.
- Migrate the most important existing visualizations first: session trends, activity trends/totals, goal summaries, metric trends/progress.
- Add compatibility handling for existing `analytics_dashboards.layout` while new windows store query-backed state.
- Keep datasets and visualizations registry-driven so engineers can add new objects/charts without touching compiler internals.

## Test Plan

- Backend tests for catalog exposure, query validation, compiler output, tenant isolation, soft-delete filtering, limits, cache behavior, and versioned spec migration.
- Security tests proving users cannot access another user's data through direct, root-scoped, or join-through datasets.
- API tests for catalog, query run, query profile CRUD, dashboard profile references, and admin support read-only behavior.
- Frontend tests for console state, query execution, chart suggestions, profile save/load, dashboard insertion, and migrated chart rendering.
- Performance tests with large-account fixtures for common grouped analytics queries.

## Documentation

- Update `index.md` with the analytics engine architecture, semantic dataset model, query profile lifecycle, caching/invalidation behavior, security guarantees, and migration status.

## Assumptions

- V1 does not expose raw SQL.
- Querying is user-wide across all owned fractals, with optional root/fractal filters.
- Privileges are read-all-own-data plus existing admin support access.
- Dataset and chart extensibility is engineer-owned through typed registries.
- Saved query profiles are versioned and migrated/validated over time.

## S+ Completion Bar

- One canonical engine powers console queries, saved query profiles, dashboard charts, and migrated core analytics.
- Tenant isolation is enforced in the compiler policy layer and covered by tests.
- Core analytics no longer has competing handcrafted data paths for migrated charts.
- Query UX feels fast, inspectable, and recoverable when a query is invalid or too expensive.
- `index.md` is current.

Commit message: `Design user-scoped semantic analytics engine`
