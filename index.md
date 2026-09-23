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
Template session creation assembles activity-derived goal scope once after all standalone and
circuit activities are instantiated; circuits added later attach their member goals directly.

Primary code: `services/session_*`, `services/activity_*`, `services/progress_service.py`,
`services/timer_service.py`, `blueprints/sessions_api.py`, and the matching client hooks/views.

Timer mutations persist the timer state and derived duration statistics in one
transaction, then emit immutable event payloads after commit. Completing a session is also a
terminal timer boundary: its open ordinary activity work interval is closed in the same
transaction before the session is committed; circuit-child timing remains owned by the circuit
clock. `services/timer_loading.py`
owns their response loading contract. Work-interval row locks may be reused only
inside the same SQLAlchemy transaction or savepoint.

### Programs

Programs contain dated blocks and reusable or dated program-day definitions. Program scope is
resolved by `services/program_scope.py`; execution metrics use bounded read models rather than
client recomputation.

`services/program_day_occurrences.py` is the canonical calendar evaluator. It owns the seven
day states, stable chain roles, and per-calendar-day completion semantics. When definitions
overlap, required/completed templates are deduplicated and the strongest configured
`completion_min_templates` threshold applies once for that date. Scheduled completion credits
completed, non-deleted sessions on the occurrence's local date from one of three sources: an exact
program-day link, a template match (an unlinked or same-program session using a scheduled template),
or a manual credit mapping the session to a scheduled template. Stored exclusions remove automatic
credit. `program_day_session_credits` holds manual credits/exclusions per program/date/session; rows
are dormant when the session's local date or the schedule no longer matches. Every evaluator caller
loads candidates through `services/program_day_credits.py`, so calendar, metrics (calculation v5),
day review, and Create Session day options attribute sessions identically.

Manual Complete and Rest statuses are stored once per program/calendar date and resolved by the
same evaluator. Complete changes adherence and chain success without fabricating session evidence;
Rest removes the scheduled date from adherence and bridges chains. Clearing a status restores
automatic evaluation. Definition-level completion flags are legacy compatibility data and are not
written or used by calendar, metrics, onboarding, create-session day options, or session-completion workflows.
The day-review pane places one clickable effective-status icon beside the first scheduled day
name: a blue circle while scheduled, a check when met, or an X when missed. Its dropdown escapes
the pane's scroll clipping; when definitions overlap, its actions apply to every definition on
that date. The calendar has one multi-day selection mode for block ranges, bulk statuses, and
calendar events. Any date inside the selected program is selectable; `useCalendarDragSelection` owns
the gestures (press-and-drag selects the range between cells, including over event ribbons, with a
live preview; a press without movement toggles one date; Shift extends), so FullCalendar's own
selection and clicks stand down in that mode. Status actions apply only to the scheduled subset;
**Plan event** spans the whole selection. Cells are keyboard-selectable and highlighted when selected.
The client expects program metrics calculation v6 and day read model schema v5.
Calendar day ribbons use the same status symbol as the day-review pane (check, X, or blue circle from
`getProgramDayStatusSymbol` and `ProgramDayStatusMark`), shown once per date on the selected program's
first ribbon; the symbol is decorative beside the ribbon's assistive state text.
Reusable definitions are scheduled onto dates through `program_day_occurrence_schedules`
(`schedule_block_day` writes a row, never a placeholder session); the evaluator treats those dates
as occurrences, and the day pane keeps "Plan this day" available for today and future dates, with
"Remove from this date" for explicit schedules. Calendar events (`calendar_periods`,
`services/calendar_periods.py`, `/api/<root_id>/calendar-periods`) are fractal-wide, named spans such
as vacations. Precedence for a scheduled date is manual override, then a streak-protecting event
(only when the date would not otherwise be met; it becomes rest with `status_source: "period"`),
then automatic evaluation. Events render as hatched spanning bars, as a banner in the day pane, and
as a protected-day count in the overview.
In multi-day mode, the sidebar requests metrics for the exact selected scheduled dates, excluding
gaps from adherence, evidence, and block totals. Non-contiguous selections use a compact
"N selected days" heading rather than displaying the misleading first-to-last date range.

The day-review pane is review-first: its one session list covers every session on the date, labelled
credited (with source), off-plan, or other program, with per-session goal alignment (the same
equal-split allocation as program metrics, via `services/program_day_summary.py`) and server-provided
credit options. Off-plan sessions sit inside the first program-day card; planning actions appear only
for today and future unscheduled dates. Range summaries list each observed date's completed sessions
(any program, `id` and `name`); the calendar names them as plain text only on dates
without a selected-program ribbon (scheduled dates keep just the ribbon and its status symbol); the legacy
program-payload session events are not rendered on the Programs page.

`ProgramDayReadModelService` emits schema v4, requires an IANA timezone, caps the complete
expanded chain window at `MAX_WINDOW_DAYS`, reports truncated context, and provides cursor-paged
day detail. The client rejects unsupported schema versions. FullCalendar block labels are
reconciled idempotently, cleaned on cell unmount, and activated through React event delegation.

Detailed design:

- [Program calendar and chain read model](planning/programs-scoped-sidepane-chain-calendar.md)
- [Program metrics](planning/program-metrics-insights.md)
- [Program-aware session creation](planning/program-aware-create-session.md)
- [Manual and bulk program-day statuses](planning/program-day-manual-statuses.md)
- [Day review summary and session credit](planning/program-day-review-summary-and-credit.md)
- [Calendar events and occurrence scheduling](planning/program-calendar-periods-and-scheduling.md)

### Notes and analytics

Notes support goal/session/activity scoping and safe markdown media rendering. Analytics uses
a tenant-governed semantic catalog and structured/sanitized SQL execution. Saved views are
separate from dashboard layout; registered visualizations provide explicit query explanations.

Primary code: `services/note_service.py`, `services/analytics_*`, `blueprints/notes_api.py`,
`blueprints/analytics_api.py`, and `client/src/components/analytics/`.

`services/goal_history_read_model.py` and `services/goal_note_read_model.py` are
request-scoped bulk loaders. Landing publication reuses them while projecting each
goal through the canonical timeline and note services. Analytics query caching is
bounded in development/testing and bypassed in production-like multi-worker runtimes.

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

AI agent harness: [implementation plan](planning/ai-agent-harness.md) and
[production review with latest intent addendum](planning/ai-agent-harness-production-review-2026-09-20.md).
The current implementation contains delegated OAuth/MCP, reviewed proposal execution,
and a fully embedded, persistent chat shell backed by the gated provider worker.
The September 22 target replaces the handoff-first flow, removes manual entity-focus
selection, and supports reviewed create/update proposals across goals, sessions,
activities, metrics, programs, notes and templates. The agent discovers scoped context
automatically; users preview and accept an immutable proposal before domain writes occur.
Existing domain services remain canonical. Optional connectors have separate release
gates. The embedded vertical slice and local correctness fixes are implemented behind
feature flags; provider, browser, operations and deployment evidence remain release gates.

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
- `./run-tests.sh browser` / `restore-drill`
- `./run-tests.sh lint`
- `./run-tests.sh maintain`
- `./run-tests.sh audit`
- `./run-tests.sh file <path>`

Backend CI gates migration health, one complete unit/integration/performance/e2e
coverage run, a production dependency audit, a logical backup/restore drill, and both
the backend and isolated MCP adapter production containers. Consolidating the test
layers avoids executing the same backend tests again only to collect coverage.
`pytest.ini` owns the services/blueprints coverage scope and ratcheted threshold;
`scripts/check_backend_coverage_gate.py` prevents CI from stripping it through `addopts`.
`scripts/check_backend_maintainability.py` caps oversized backend modules and exception debt.
Frontend CI gates its production dependency audit, zero-warning lint, all-source
coverage, production build, responsive source checks, maintainability budgets, and
desktop/mobile Chromium workflows against the real Flask app and a disposable
PostgreSQL database.

Backend tests build the schema once per pytest session and clear ORM rows in dependency
order between tests, preserving real commit and independent-connection semantics. Frontend tests use
four isolated Vitest threads. The `all` command runs the complete backend and frontend
suites concurrently and reports each result, reducing wall time without removing tests.
The delegated MCP adapter has a separate offline-capable unit suite at
`agent_adapter/tests/`, run with `./run-tests.sh agent-adapter` and in CI against the
pinned MCP SDK. Its runtime dependencies remain isolated from the Flask application.
See `tests/README.md` for full-suite execution details.

Standing review rules—including boundary-case tests, broad-exception criteria, large-file
ownership seams, commit hygiene, and high-churn manual QA—live in
[Engineering Quality Policy](docs/architecture/ENGINEERING_QUALITY_POLICY.md).

The current backlog assessment and item-level evidence live in
[Backlog Quality Audit — September 2026](planning/backlog-quality-audit-2026-09.md).
The broader production assessment, release-gate gaps, and test-speed evidence are in
[Production Quality Audit — September 7, 2026](planning/production-quality-audit-2026-09-07.md).

## Practical invariants

- Preserve tenant isolation and soft-delete filters in every new query.
- Keep routes thin and transactions/events service-owned.
- Reuse canonical serializers, formatters, query keys, and domain evaluators.
- Bound date ranges, pagination, query count, and payload size at API boundaries.
- Add neighbouring boundary cases for every classifier, count, state, and cursor fix.
- Remove retired adapters and render paths when their replacement becomes canonical.
- Treat destructive schema work as an explicit, backed-up rollout decision.
- Keep this file a map; link to details instead of embedding a changelog.
