# Fractal Goals — Codebase Index

> High-level architectural map. Update this file only when ownership, core workflows,
> invariants, or quality tooling change. Put feature history and delivery detail in `planning/`.

## Product and runtime

Fractal Goals is a full-stack goal and practice tracker built around a five-level hierarchical
goal model. Sessions capture execution; activities, templates, programs, targets, progress,
notes, and analytics provide structure and evidence.

- Backend: Flask on port 8001, PostgreSQL, SQLAlchemy, Alembic
- Frontend: React/Vite on port 5173, TanStack Query, CSS modules
- Liveness: `/health` and `/api/healthz`; database readiness: `/api/readyz`
- Direct local `python app.py` startup applies pending migrations; imports and WSGI discovery do not

## Architecture

### Backend

The normal flow is:

`request → blueprint → validation → service → serializer → response`

- `blueprints/` owns HTTP/auth/response concerns and stays thin.
- `validators/` owns request schemas and validation decorators by domain.
- `services/` owns business rules, tenant checks, transactions, domain events, and read models.
- `models/` owns relational shape and ORM relationships.
- `migrations/` is append-only Alembic history.

Services are the canonical mutation boundary. Ownership is rooted in user-owned fractals;
soft-deleted rows do not contribute to current state. Domain events emit only after successful
commit or through an explicit pending-event queue.

Key decisions:

- [PostgreSQL-first persistence](docs/architecture/ADR_0001_POSTGRES_FIRST.md)
- [React Query as the client data layer](docs/architecture/ADR_0002_REACT_QUERY_CANONICAL_DATA_LAYER.md)
- [Analytics service ownership](docs/architecture/ADR_0003_ANALYTICS_SERVICE_TOPOLOGY.md)
- [Database migration policy](docs/architecture/MIGRATION_POLICY.md)
- [Backup and restore runbook](docs/architecture/BACKUP_RESTORE_RUNBOOK.md)

### Frontend

The normal flow is:

`page/component → query or mutation hook → shared query key → API module`

- `client/src/pages/` owns route composition.
- `client/src/components/` owns reusable UI and feature views.
- `client/src/hooks/` owns server-state orchestration and invalidation.
- `client/src/contexts/` owns auth, theme, header, and lightweight UI coordination.
- `client/src/utils/` owns API adapters, normalization, formatting, and pure view models.

Remote records live in TanStack Query. Components do not mirror API collections into context
or local storage. Mutation success invalidates the narrow shared query-key root that owns the
affected read models.

## Core domains

### Goals and targets

Goals form `Ultimate → Long Term → Mid Term → Short Term → Immediate` hierarchies. Fractal
roots self-scope with `root_id == id`. Goal status, contribution evidence, pause history,
association inheritance, target evaluation, and timeline projections are service-owned.

Primary code: `services/goal_service.py` and `_goal_*` modules, `services/goal_target_service.py`,
`blueprints/goals_api.py`, `client/src/components/goals/`, and `client/src/pages/Goals.jsx`.

### Sessions, activities, and progress

Sessions are the execution container. Activity definitions and instances, metrics, sets,
circuits, work intervals, templates, and tags remain relationally linked. Dynamic progress is
calculated from canonical result data; obsolete snapshot progress is not a competing source.

Primary code: `services/session_*`, `services/activity_*`, `services/progress_service.py`,
`services/timer_service.py`, `blueprints/sessions_api.py`, and the matching client hooks/views.

### Programs

Programs contain dated blocks and reusable or dated program-day definitions. Program scope is
resolved by `services/program_scope.py`; execution metrics use bounded read models rather than
client recomputation.

`services/program_day_occurrences.py` is the canonical calendar evaluator. It owns the seven
day states, stable chain roles, and per-calendar-day completion semantics. When definitions
overlap, required/completed templates are deduplicated and the strongest configured
`completion_min_templates` threshold applies once for that date. Scheduled completion requires
exact program-day/date/template-linked, completed, non-deleted sessions.

`ProgramDayReadModelService` emits schema v2, requires an IANA timezone, caps the complete
expanded chain window at `MAX_WINDOW_DAYS`, reports truncated context, and provides cursor-paged
day detail. The client rejects unsupported schema versions. FullCalendar block labels are
reconciled idempotently, cleaned on cell unmount, and activated through React event delegation.

Detailed design:

- [Program calendar and chain read model](planning/programs-scoped-sidepane-chain-calendar.md)
- [Program metrics](planning/program-metrics-insights.md)
- [Program-aware session creation](planning/program-aware-create-session.md)

### Notes and analytics

Notes support goal/session/activity scoping and safe markdown media rendering. Analytics uses
a tenant-governed semantic catalog and structured/sanitized SQL execution. Saved views are
separate from dashboard layout; registered visualizations provide explicit query explanations.

Primary code: `services/note_service.py`, `services/analytics_*`, `blueprints/notes_api.py`,
`blueprints/analytics_api.py`, and `client/src/components/analytics/`.

### Interaction contracts

Portalled controls use the shared anchored-overlay positioner so headers and narrow work cards
cannot clip them. Each overlay retains outside-pointer dismissal, focus containment, Escape
focus restoration, and viewport-safe repositioning through scroll and resize.

Circuit runs follow the same selection, lifecycle, timing, removal, metric, and note contracts
as regular session activities. The parent circuit owns its clock; rounds and members remain
structural children, and circuit notes use canonical session-note targets rather than a parallel
store. Quick-entry sessions remain activity-only; standard sessions and templates own the full
circuit lifecycle. Detailed behavior is covered by the circuit component and service tests.

### SaaS and operations

Auth, quotas, admin tooling, feature flags, telemetry, email delivery, landing publication,
data export, and account deletion form the account boundary. Admin support access is explicit
and scoped; it is not unrestricted impersonation. Operational event history is retained for
admin analytics and export according to the documented retention controls.

## Repository map

- `app.py`, `config.py`, `extensions.py` — application/runtime setup
- `blueprints/` — HTTP routes
- `services/` — domain logic and read models
- `models/` — ORM models and database session setup
- `validators/` — input validation
- `migrations/` — Alembic revisions
- `client/` — React application
- `tests/unit`, `tests/integration`, `tests/performance` — backend verification layers
- `docs/architecture/` — standing decisions and runbooks
- `planning/` — detailed feature specs, audits, and delivery records
- `scripts/`, `run-tests.sh` — operational and quality tooling

## Testing and quality

Use `./run-tests.sh` as the canonical entry point:

- `./run-tests.sh backend` / `frontend` / `all`
- `./run-tests.sh coverage`
- `./run-tests.sh lint`
- `./run-tests.sh maintain`
- `./run-tests.sh audit`
- `./run-tests.sh file <path>`

Backend CI separately gates migration health, unit, integration, performance, and full-suite
coverage. `pytest.ini` owns the services/blueprints coverage scope and ratcheted threshold;
`scripts/check_backend_coverage_gate.py` prevents CI from stripping it through `addopts`.
`scripts/check_backend_maintainability.py` caps oversized backend modules and exception debt.
Frontend CI gates tests, lint, production build, responsive checks, and maintainability budgets.

Standing review rules—including boundary-case tests, broad-exception criteria, large-file
ownership seams, commit hygiene, and high-churn manual QA—live in
[Engineering Quality Policy](docs/architecture/ENGINEERING_QUALITY_POLICY.md).

The current backlog assessment and item-level evidence live in
[Backlog Quality Audit — September 2026](planning/backlog-quality-audit-2026-09.md).

## Practical invariants

- Preserve tenant isolation and soft-delete filters in every new query.
- Keep routes thin and transactions/events service-owned.
- Reuse canonical serializers, formatters, query keys, and domain evaluators.
- Bound date ranges, pagination, query count, and payload size at API boundaries.
- Add neighbouring boundary cases for every classifier, count, state, and cursor fix.
- Remove retired adapters and render paths when their replacement becomes canonical.
- Treat destructive schema work as an explicit, backed-up rollout decision.
- Keep this file a map; link to details instead of embedding a changelog.
