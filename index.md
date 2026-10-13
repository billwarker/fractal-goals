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

Programs, Sessions, Notes, and Analytics share `components/layout/MobilePageFooter.jsx` (a fixed,
portalled full-width footer button) and the `--mobile-page-footer-height` / `--mobile-sidebar-height`
tokens. Mobile openers leave the header; sheets sit above the footer. Page filter panes compose
`layout/ResponsiveSidePane.jsx` (inline on desktop, portalled sheet on mobile) with
`hooks/usePersistedPaneOpen.js`; `layout/BodyPortal.jsx` portals page-level modals. Detailed layout contracts:
[UI behaviour contracts](planning/ui-contracts-reference.md#mobile-page-footer-and-sidebars).

## Core domains

### Goals and targets

Goals form `Ultimate → Long Term → Mid Term → Short Term → Immediate` hierarchies. Fractal
roots self-scope with `root_id == id`. Goal status, contribution evidence, pause history,
association inheritance, target evaluation, and timeline projections are service-owned.

Primary code: `services/goal_service.py` and `_goal_*` modules, `services/goal_target_service.py`,
`blueprints/goals_api.py`, `client/src/components/goals/`, and `client/src/pages/Goals.jsx`.

Goal Details has one Timeline section beneath targets: a lifetime calendar heatmap (intensity =
completed-activity counts, user timezone, optional child scope) above cursor-paginated evidence
cards; selecting a date filters the list. Header, sticky calendar, footer and responsive sizing
contracts live in [UI behaviour contracts](planning/ui-contracts-reference.md#goal-details-and-timeline).

`blueprints/goal_history_api.py` registers history reads. `services/goal_timeline_service.py` owns the
shared evidence projection, `services/goal_activity_heatmap.py` daily aggregation, and
`services/goal_timeline_page.py` stable mode filtering/cursors. Calendar summaries use complete
evidence; pages default to 20 entries with no total-history cap, and rich activity/target data loads
only for the selected page. Shared activity instances count once. `components/common/CalendarHeatmap.jsx`
serves goal and session calendars; `GoalTimelineFeed.jsx` and `GoalTimelineEntries.jsx` own the list
and canonical cards. All queries share the `goalTimeline` invalidation root. Published landing
snapshots reuse the list without authenticated fetches or a heatmap.
See [Goal Timeline](planning/goal-activity-heatmap.md).

Goal evidence is resolved per activity instance: active direct instance links are unioned with
existing definition/group sources, and each instance counts once across overlapping sources and
ancestor rollups. One-off links roll upward, never inherit downward or add a definition to a
reusable activity catalog. Occurrence dates retain goal lifetime, pause/completion exclusions,
and target windows. `services/instance_goal_evidence.py` owns that attribution invariant;
`activity_instance_goal_service.py` owns authenticated, reversible association mutations, and
`instance_goal_target_reconciliation.py` applies existing target lifecycle rules in the same
transaction. The additive `activity_instance_goal_associations` table preserves creation history
on soft removal/restoration and cascades hard deletion. Canonical instance serialization exposes
only direct links as `associated_goal_ids`, projected with instance reads rather than per-row queries.

Session Detail exposes reversible one-off links on actual activity instances (including circuit
members and completed sessions) through the scoped goal's icon, only when that instance is selected
and a goal is scoped. `useActivityInstanceGoalAssociation` owns cache updates and evidence
invalidation; duplication starts with no one-off links. Interaction details:
[UI behaviour contracts](planning/ui-contracts-reference.md#session-detail-one-off-goal-links) and
[Scoped goals and instance associations audit](planning/scoped-goals-instance-associations-audit.md).

### Sessions, activities, and progress

Sessions are the execution container. Activity definitions and instances, metrics, sets,
circuits, work intervals, templates, and tags remain relationally linked. Dynamic progress is
calculated from canonical result data; obsolete snapshot progress is not a competing source.
Activities, circuit runs, and rounds use one fractal-owned tag catalog (`ActivityTagDefinition`).
Circuit pickers read the full catalog and assign its identity, extending activity bindings to
members as needed; they never silently merge same-name definitions. Activity availability controls
remain catalog-owned. Circuit scopes materialize canonical instance/set links and preserve prior
or overlapping assignments on removal. All session tag editors share the activity chip styling.
See [Shared circuit tags audit](planning/shared-circuit-tags-audit.md).
Metric input type and precision are live settings of the shared fractal metric, including for
existing active/completed sessions and template prescriptions. Saving a metric refreshes activity
and circuit definition caches; formatting changes preserve recorded and planned numeric values.
Template session creation assembles activity-derived goal scope once after all standalone and
circuit activities are instantiated; circuits added later attach their member goals directly.

Primary code: `services/session_*`, `services/activity_*`, `services/progress_service.py`,
`services/timer_service.py`, `blueprints/sessions_api.py`, and the matching client hooks/views.

Template section items carry a stable `item_key` (never `id`, a legacy activity-id alias) and an
optional `prescription`: planned values per set or per metric, activity and set notes, and planned
tags (`tags`: activity tag binding ids on the activity and on each set) (`validators/prescriptions.py`
owns shape; `services/prescriptions.py` checks that metrics and splits belong to the item's activity
and respect metric bounds, and that tags are active bindings of that activity). Planned tags are
applied to the new instance and its planned sets at session creation, like tags added in-session. Templates count content edits in
`revision`. Session creation snapshots the authoritative template's or dated plan's prescription onto
`activity_instances.prescription`, looked up by `item_key`; client-sent planned values are ignored.
Circuit items may plan rounds and per-round slot values; the run starts with the planned rounds and
snapshots the plan on `circuit_runs.prescription`.
Planned set activities start with one empty `planned` set per planned set and are reference-only
(no metric defaults). Plan editors live in `components/prescriptions/`, plan section helpers in
`services/plan_sections.py`, and the session card's "(plan …)" hint in `utils/sessionPrescription.js`.
Plans never feed targets.

Timer mutations persist the timer state and derived duration statistics in one
transaction, then emit immutable event payloads after commit. Completing a session is also a
terminal timer boundary: its open ordinary activity work interval is closed in the same
transaction before the session is committed; circuit-child timing remains owned by the circuit
clock. Completing a paused session ends it at the pause boundary (`last_paused_at`), not the click:
`session_end`, paused activity timers, and paused circuit runs all close there, and any client-sent
`session_end` is ignored; `completed_at` still records the click. `services/timer_loading.py`
owns their response loading contract. Work-interval row locks may be reused only
inside the same SQLAlchemy transaction or savepoint.

### Programs

Programs contain dated blocks and reusable program-day definitions. The complete domain and UI
description is in [Programs — domain and UI reference](planning/programs-domain-reference.md).

**Ownership and scheduling.** Program days belong to the program (`program_days.program_id`), not a
block. A day recurs on weekdays (`day_of_week`) every `repeat_every_weeks` weeks (week zero is the
Monday–Sunday week containing the program start) and/or on explicit dates stored only as
`program_day_occurrence_schedules` rows. `program_day_occurrence_exclusions` suppress single dates.
Blocks only label the dates they cover (`block_for_date`) and can track weeks (`track_weeks`,
`week_start_day`); `services/program_rollups.block_weeks` and `client/src/utils/programBlockWeeks.js`
share one definition tested against `tests/fixtures/block_weeks_cases.json`. Days are managed at
`/api/<root>/programs/<program>/days[/<day>[/duplicate|/schedule|/unschedule|/move|/goals]]` and
ordered by `PUT …/days/order`. `utils/programDaySchedule.js` owns the client schedule projection.

**Calendar invariants** (every write path: UI, API, agent proposals). `services/program_calendar_invariants.py`
rejects overlapping blocks (backed by the `ex_program_blocks_no_overlap` exclusion constraint) and any
date holding more than one program day. Every calendar write takes the program row lock first.
Violations are 409 `ProgramServiceValidationError`s (`program_block_overlap`,
`program_day_date_conflict`) with a `conflicts` list; `utils/programCalendarConflicts.js` mirrors them
as editor hints. Program-day goals are bounded by the program's goals and descendants
(`services/program_focus.py`); narrowing returns 409 `program_day_goal_out_of_scope` until resent with
`prune_day_goals`. `program_block_goals` is retained legacy data.

**Evaluation.** `services/program_day_occurrences.py` is the canonical calendar evaluator (seven day
states, chain roles, per-date completion). Every caller loads candidate sessions through
`services/program_day_credits.py`, so calendar, metrics, day review, and Create Session attribute
sessions identically. Manual Complete/Rest statuses and fractal-wide calendar events
(`services/calendar_periods.py`) resolve in that evaluator: manual override, then a streak-protecting
event, then automatic evaluation. Streaks are drawn from server `chain_role`/`run_length_at_date`, never
recomputed in the client.

**Read models.** The client expects metrics calculation v9 (`services/program_metrics_service.py`,
`program_rollups.py`, `program_block_metrics.py`), day read model schema v7
(`ProgramDayReadModelService`, IANA timezone required, bounded window, cursor-paged detail), and the
root-scoped calendar feed schema v1 (`GET /api/<root_id>/programs/calendar-feed`,
`ProgramCalendarFeedService`, ≤62 days, weak ETag, month chunks nested under the day read-model query
root). `services/program_scope.py` resolves program scope; execution metrics are bounded server read
models, not client recomputation. The Days workspace reads one evaluator pass from
`GET …/plan-occurrences`.

**Dated session plans.** `program_session_plans` (`services/program_session_plans.py`) holds one plan per
program day, template, and date. Plans are virtual until saved (an unplanned occurrence *is* the
template), save with `row_version` (409 on conflict), never get rewritten by template edits, and are
materialized into a session's transaction when chosen in Create Session
(`sessions.program_session_plan_id`).

**UI ownership.** `pages/ProgramCalendarPage.jsx` composes the Calendar and Days views;
`components/programs/` owns the calendar, side pane, blocks panel, and `ProgramOptionsModal`;
`components/programs/days/` owns the Days workspace. Within the calendar, `ProgramCalendarView` wires
FullCalendar, `programCalendarCellDecorations.js` owns imperative day-cell decoration,
`useContinuousCalendarScroll` owns month tracking/continuous scrolling, and `useCalendarDragSelection`
owns multi-day gestures; `utils/programCalendarContinuous.js` and `utils/programCalendarStreaks.js`
own continuous-mode windows and streak drawing.

**ORM note.** `ProgramDay.template_links` is the only writable path to `program_day_templates`;
`ProgramDay.templates` is `viewonly`, so ORM cascades delete each link once.

Days logged-session cards share the Session Detail query cache. `CompletedSessionHeader` owns
badge navigation and session metadata; shared prescription editors own circuit round/member
highlighting in both editable and read-only cards. See
[Plan editor UI contracts](planning/ui-contracts-reference.md#plan-editors-and-planned-value-hints).

Detailed design:

- [Programs — domain and UI reference](planning/programs-domain-reference.md)
- [Program-level days and block weeks](planning/program-level-days-and-block-weeks.md)
- [Days alignment, picker, and goals](planning/program-days-alignment-picker-goals.md)
- [Program days and dated session plans](planning/program-days-session-plans.md)
- [Program calendar and chain read model](planning/programs-scoped-sidepane-chain-calendar.md)
- [Program metrics](planning/program-metrics-insights.md)
- [Program-aware session creation](planning/program-aware-create-session.md)
- [Manual and bulk program-day statuses](planning/program-day-manual-statuses.md)
- [Day review summary and session credit](planning/program-day-review-summary-and-credit.md)
- [Calendar events and occurrence scheduling](planning/program-calendar-periods-and-scheduling.md)
- [Viewport-driven calendar feed](planning/program-calendar-viewport-feed.md)
- [Calendar invariants and optional templates](planning/program-calendar-invariants-and-optional-templates.md)

### Bounded history reads

`ProgressService` resolves one predecessor identity per requested instance in SQL, then
hydrates only requested instances and those predecessors. Completed predecessors take
priority, same-session instances are excluded, and tag/set inclusion remains canonical.
There is no competing full-history comparison cache/calculation.

`goal_evidence_query.py` projects canonical timeline identities; `goal_evidence_read_model.py`
owns SQL keyset pages and timezone-aware daily aggregates. `GoalTimelineService` enriches
only the selected page through `GoalHistoryReadModel`. Snapshot publication retains its
request-scoped preloaded history projection.

`goal_analytics_queries.py` owns relational analytics attribution; `GoalAnalyticsService`
returns SQL aggregates by default and explicit chart buckets on demand (366 points for one
goal, 120 per goal for multi-goal charts). Date/activity filters apply before aggregation.
`SessionAnalyticsService` caps each evidence page at 500 instances within a paginated
session window and reports continuation for both instances and older sessions. Analytics charts
automatically traverse both continuations, merge session identities, and show loading/retry status
until full history is available.
`SessionListReadModel` remains available through the opt-in `view=summary` API. The Sessions
page requests full session records so activities and notes render inline as each page loads,
without a separate detail-expansion control. `WindowedSessionRow` retains real cards in the DOM and uses CSS `content-visibility: auto`
to defer offscreen layout and paint. Intrinsic block sizes remember rendered heights; selected
and focused cards stay rendered. No observer-driven unmounting or placeholder buttons participate
in scrolling. Background
session refreshes retain the loaded list instead of replacing it with a loading screen.

`flowTreeLayout.js` owns geometry. `useFlowTreeGraph` memoizes it by ordered topology,
layout mode and viewport class, separately from callbacks, colors and evidence presentation.
Optional surface widgets and the quick-session workspace load at their use boundaries.

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
store. Completing a quick session completes every active activity instance, including untimed ones;
quick-entry cards have no individual completion control and use the shared session completion button.
Quick-entry sessions remain activity-only; standard sessions and templates own the full
circuit lifecycle. Detailed behavior is covered by the circuit component and service tests.

### SaaS and operations

Auth, quotas, admin tooling, feature flags, telemetry, email delivery, landing publication,
data export, and account deletion form the account boundary. Admin support access is explicit
and scoped; it is not unrestricted impersonation. Operational event history is retained for
admin analytics and export according to the documented retention controls.
The Logs page reads owner-scoped event history; only admins can clear a fractal's complete
log history, after explicit confirmation regardless of filters. `useLogsData` owns that mutation
and invalidates paginated and infinite history through the shared `logsRoot` query key.

Session tokens carry the session audience, `users.session_version`, and the original login
time. Password change/reset, admin resets, suspension, and "Sign out of all devices" increment
the version, revoking every outstanding token; a password change reissues one for the acting
device. Refresh cannot extend a session past `SESSION_MAX_LIFETIME_DAYS`.

Rate limits key on the real client: `request_identity.py` trusts `X-Forwarded-For` only for
requests attested by the nginx frontend's `TRUSTED_PROXY_SECRET`, at `TRUSTED_PROXY_HOPS`.
Production refuses to start without both. Uncaught database and application errors return the
standard JSON 500 from `blueprints/error_handlers.py`. See the
[proxy and sessions runbook](docs/architecture/PROXY_AND_SESSIONS_RUNBOOK.md).

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

- `app.py`, `config.py`, `extensions.py`, `request_identity.py` — application/runtime setup
- `blueprints/` — HTTP routes
- `services/` — domain logic and read models; large services compose private `_<domain>_*.py`
  mixins or modules behind a stable public module (goals, sessions, progress, analytics,
  serializers, landing publication, completion handlers, admin)
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
- `./run-tests.sh lint` (includes type checks and both maintainability gates)
- `./run-tests.sh typecheck`
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
Static types ratchet: basedpyright checks all backend application code against
`.basedpyright/baseline.json` (new errors fail; fixed ones drop out), and TypeScript `checkJs`
covers the client API layer, query keys, and pure view models with zero errors.
Frontend CI gates its production dependency audit, zero-warning lint, all-source
coverage, production build, responsive source checks, maintainability budgets, and
desktop/mobile Chromium workflows against the real Flask app and a disposable
PostgreSQL database.

Shared frontend test doubles live in `client/src/test/` (excluded from coverage), e.g.
`test/programs/` for the FullCalendar mock and Days fixtures; test files register them with
`vi.mock(path, () => import(helper))`.

`run-tests.sh` runs backend pytest through `scripts/run_isolated_backend_tests.py`, which
creates and drops a uniquely named disposable testing database. `FRACTAL_TEST_DATABASE_URL`
keeps that isolation through repeated test-environment bootstraps.
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
Read-path query and payload budgets for a power-user-sized account live in
`tests/performance/test_power_account_budgets.py`; the performance pass that introduced them is in
[Performance Pass — September 2026](planning/performance-pass-2026-09.md).
History scaling guards live in `tests/performance/test_history_scaling.py`; authenticated
static dependency budgets live in `client/scripts/bundle-budgets.mjs`; large-list/tree browser
checks live in `client/e2e/performance.spec.js`. The measured baseline and remediation evidence
are in [Performance Audit — October 12, 2026](planning/performance-audit-2026-10-12.md).

## Practical invariants

- Preserve tenant isolation and soft-delete filters in every new query.
- Revoke sessions (`revoke_user_sessions`) in the same transaction as any credential or
  account-status change.
- Catch the failure you expect; `except Exception` is reserved for containment boundaries.
- Keep routes thin and transactions/events service-owned.
- Reuse canonical serializers, formatters, query keys, and domain evaluators.
- Eager-load what `serialize_goal` reads with `goal_serializer_relationship_loaders()` (nestable
  under `Goal.children` / `Session.goals`); return subtrees via `GoalService.load_goal_subtree`.
- Goal payload top-level fields are canonical; `attributes` holds only fields that exist nowhere
  else. Client code reads goals through `utils/goalNodeModel.js` accessors (top-level first).
- Bound date ranges, pagination, query count, and payload size at API boundaries.
- Add neighbouring boundary cases for every classifier, count, state, and cursor fix.
- Remove retired adapters and render paths when their replacement becomes canonical.
- Treat destructive schema work as an explicit, backed-up rollout decision.
- Planned values are snapshots: sessions keep the prescription they started with, plans keep the
  template revision they copied, and neither ever becomes target or completion evidence.
- Keep this file a map; link to details instead of embedding a changelog.
