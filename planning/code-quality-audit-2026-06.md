# Code Quality Audit & Remediation — June 2026

> Tracking doc for the post-stabilization quality pass.
> Source audit: full-repo review against [index.md](../index.md) standards.
> Overall grade at audit time: **B+ / A−** — healthy architecture, calcification at the edges (god-files, duplicated utilities, carried-forward legacy/dead code). Not structural rot.

## How to use this doc

- Check items off as they land. Each item links to the offending file(s).
- Keep the **Status** column honest: `todo` / `in-progress` / `done` / `wont-fix`.
- When an item lands, note the commit/PR and any follow-up.

---

## P0 — Drift that undermines stated invariants

These directly violate guarantees the index makes. Low-risk, high-value.

- [x] **P0-1 — Split `AdminService` god-class (1,710 LOC).** ✅ Moved the full landing cluster (~1,030 lines incl. settings/options/snapshot/publish + app-setting helpers + all landing constants) into `services/landing_publish_service.py` (`LandingPublishService`). AdminService dropped to **680 LOC**. Repointed `admin_api` landing routes and `public_service` constant import to the new module; pruned 21 now-unused imports from AdminService. Full move (no delegation shim). Pyflakes clean, imports resolve, 35/38 admin tests pass — the 3 failures are **pre-existing on HEAD** (see findings below), not caused by this change.
- [x] **P0-2 — Consolidate duplicated `formatDuration`.** ✅ MetricCardWidget, LandingFeatureAnalytics, AnalyticsExtraCharts now use canonical `formatDurationSeconds` (formatters.js); SessionCard now uses `formatClockDuration` (sessionTime.js) — its `MM:SS` was a distinct clock format that already had a canonical home and now correctly rolls hours into `H:MM:SS`. Lint clean, 16 component tests green.
- [x] **P0-3 — Delete dead `legacyApi`.** ✅ Removed `legacyApi.js`, its re-exports in `api.js`, and the two `legacy.*` cases from the CSRF contract test. App code had zero consumers. core.test.js green.
- [ ] **P0-4 — Reconcile competing analytics implementations.** index.md:163 says handcrafted charts should be migrated onto the engine registry then retired; [AnalyticsExtraCharts.jsx](../client/src/components/analytics/AnalyticsExtraCharts.jsx) (288 LOC) still coexists. Migrate or mark as tracked retirement target.

## P1 — Half-baked / oversized surfaces

Over the implicit ~800-LOC decomposition threshold; the index's own "decompose before they calcify" backlog.

- [ ] **P1-5 — Decompose `SessionActivityItem.jsx` (1,539 LOC, 26 hooks)** into controller hook + focused subcomponents. — [client/src/components/sessionDetail/SessionActivityItem.jsx](../client/src/components/sessionDetail/SessionActivityItem.jsx)
- [ ] **P1-6 — Decompose `GoalDetailModal.jsx` (1,460 LOC, 34 hooks);** push state into `useGoalDetailController`. — [client/src/components/GoalDetailModal.jsx](../client/src/components/GoalDetailModal.jsx)
- [ ] **P1-7 — Split `programs.py` (1,359) and `goal_service.py` (1,283)** along existing seams (block scheduling / occurrence gen / goal-attachment validation / calendar). — [services/programs.py](../services/programs.py), [services/goal_service.py](../services/goal_service.py)
- [ ] **P1-8 — Split `validators.py` (1,984 LOC, 92 schemas)** into per-domain modules with a re-export shim. — [validators.py](../validators.py)
- [ ] **P1-9 — Audit `completion_handlers.py` (1,145) vs `progress_service.py` (1,187) overlap;** one source of truth for "metric values off an instance." — [services/completion_handlers.py](../services/completion_handlers.py)

## P2 — Redundancy & centralization gaps

- [ ] **P2-10 — Replace 409 inline `style={{}}` blocks with design tokens** (worst: GoalUncompletionModal 24, GoalHeader 20, GoalDetailModal 19). Start with worst offenders.
- [ ] **P2-11 — Triage 73 non-test `console.*` calls;** route through a logging utility so production logs are filterable/silenceable.
- [ ] **P2-12 — Centralize duplicated `formatDate`/`formatDateTime`/`formatMetricValue`** into formatters.js/dateUtils.js. — GoalTimelineView.jsx:20 (SessionCard's date helper is a thin local wrapper over `formatDateInTimezone`, acceptable; remaining work is `formatMetricValue`/`formatDateTime` dedup)
- [ ] **P2-13 — Quarantine `python-scripts/` one-off migrations** (57 scripts, 14 legacy migrations predating Alembic) into `archive/` with a README, or delete.
- [ ] **P2-14 — Resolve `@deprecated` markers in active code.** — goalHelpers.js:50 (`getValidChildTypes`), ChartJSWrapper.jsx:242 (`useChartOptions`)
- [ ] **P2-15 — Reduce `legacy` serializer branches** in [services/serializers.py](../services/serializers.py) (`_merge_legacy_activity_payload`, legacy `session_data`/`sets` reconcile ~195–597); data-migrate old rows if possible.

## P3 — Hardening & polish

- [ ] **P3-16 — Standardize empty/no-data states** into one shared component.
- [ ] **P3-17 — Add a hard LOC budget to the maintainability audit** ([client/scripts/maintainability-audit.mjs](../client/scripts/maintainability-audit.mjs)); CI gate at ~800 LOC so P1 doesn't recur.
- [ ] **P3-18 — Verify N+1 batching for the landing snapshot publish path** (`_serialize_public_goal_tree` + `_enrich_landing_tree_with_history`); add query-count assertion.
- [ ] **P3-19 — Document the analytics service topology** (5 overlapping services) in a `docs/architecture/` ADR.
- [ ] **P3-20 — Centralize the tier enum** (`"legacy"`/`"free"`/`"paid"` hardcoded across quota_service.py, Admin.jsx).
- [ ] **P3-21 — Retire `progress_service` legacy aggregation / `metrics_multiplicative` fallback** once no rows depend on it. — progress_service.py:152
- [ ] **P3-22 — Split `Admin.jsx` (1,452) and `ProgramCalendarPage.jsx` (1,319)** into per-tab/per-view subcomponents + hooks.

---

## New findings (discovered during remediation)

- [ ] **NF-1 — 3 pre-existing landing test failures on `main`/HEAD.** `tests/integration/test_admin_api.py::{test_admin_can_manage_and_publish_landing_examples, test_publish_honors_showcase_selections, test_landing_example_options_endpoint}` fail on a clean checkout (before any audit work). Root cause: `get_landing_example_options` returns empty `analytics_views`; the test creates an `AnalyticsDashboard` with `kind="view"` but the query / fixture isn't matching (likely test-DB schema default `kind='dashboard'` vs expected `'view'`). **Not introduced by P0-1** — verified identical pass/fail on HEAD and branch. Needs its own fix.

## Progress log

| Date | Item | Notes |
|------|------|-------|
| 2026-06-29 | — | Audit completed, tracking doc created. |
| 2026-06-29 | P0-3 | Deleted dead `legacyApi` (module + re-exports + test cases). |
| 2026-06-29 | P0-2 | Consolidated 4 `formatDuration` reimplementations onto canonical formatters. |
| 2026-06-29 | P0-1 | Extracted `LandingPublishService` from AdminService (1710→680 LOC). Found NF-1 (pre-existing landing test failures). |
