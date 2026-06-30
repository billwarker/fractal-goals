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
- [x] **P0-4 — Reconcile competing analytics implementations.** ⚠️ **Investigated — original finding was a false positive.** `AnalyticsExtraCharts.jsx` is NOT a competing/orphaned render path: it is the shared chart-component library imported exclusively by the registry's `visualizations/{goals,sessions,activities}/index.jsx`. `Analytics.jsx` renders only through `ProfileWindow` → registry (single path, no duplication). The catalog-vs-read-model split index.md warns about is already governed: each visualization carries an `execution` tag in `visualizationQueryExplanations.js` (`catalog_sql` default vs `read_model_sql`), and read-model charts are labeled, show equivalent SQL, and disable console handoff. **Status: 22 catalog-backed, 6 read-model-backed.** No refactor needed; residual work re-scoped as P3-23 below (migrate the 6 remaining read-model charts to catalog). The misleading `AnalyticsExtraCharts` filename is the only real wart — optional rename deferred (touches 4 importers for cosmetic gain).

## P1 — Half-baked / oversized surfaces

Over the implicit ~800-LOC decomposition threshold; the index's own "decompose before they calcify" backlog.

- [ ] **P1-5 — Decompose `SessionActivityItem.jsx` (1,539 LOC, 26 hooks)** into controller hook + focused subcomponents. — [client/src/components/sessionDetail/SessionActivityItem.jsx](../client/src/components/sessionDetail/SessionActivityItem.jsx)
- [ ] **P1-6 — Decompose `GoalDetailModal.jsx` (1,460 LOC, 34 hooks);** push state into `useGoalDetailController`. — [client/src/components/GoalDetailModal.jsx](../client/src/components/GoalDetailModal.jsx)
- [ ] **P1-7 — Split `programs.py` (1,359) and `goal_service.py` (1,283)** along existing seams (block scheduling / occurrence gen / goal-attachment validation / calendar). — [services/programs.py](../services/programs.py), [services/goal_service.py](../services/goal_service.py)
- [ ] **P1-8 — Split `validators.py` (1,984 LOC, 92 schemas)** into per-domain modules with a re-export shim. — [validators.py](../validators.py)
- [ ] **P1-9 — Audit `completion_handlers.py` (1,145) vs `progress_service.py` (1,187) overlap;** one source of truth for "metric values off an instance." — [services/completion_handlers.py](../services/completion_handlers.py)

## P2 — Redundancy & centralization gaps

- [ ] **P2-10 — Replace 409 inline `style={{}}` blocks with design tokens** (worst: GoalUncompletionModal 24, GoalHeader 20, GoalDetailModal 19). Start with worst offenders.
- [x] **P2-11 — Triage 73 non-test `console.*` calls.** ✅ Added `client/src/utils/logger.js` (`logError`/`logWarn`/`logDebug`): dev prints to console as before; prod suppresses debug/warn and forwards errors to Sentry (already wired in main.jsx) when a DSN is set. Migrated all 72 `console.error` calls across 27 files to `logError`. Intentionally left: the 3 framework error boundaries (Sentry's React integration auto-captures those) and the one debug-toggle `console.log` in DebugContext. Single chokepoint now exists for production log routing.
- [ ] **P2-12 — Centralize duplicated `formatDate`/`formatDateTime`/`formatMetricValue`** into formatters.js/dateUtils.js. — GoalTimelineView.jsx:20 (SessionCard's date helper is a thin local wrapper over `formatDateInTimezone`, acceptable; remaining work is `formatMetricValue`/`formatDateTime` dedup)
- [x] **P2-13 — Quarantine `python-scripts/` one-off migrations.** ✅ Done **in place** rather than by relocation: moving the files would have broken ~40 path references in `docs/migrations/` runbooks (net negative). Instead added a prominent status section to `python-scripts/README.md` explicitly labeling the pre-Alembic schema scripts as historical/reference-only ("do not run"), separating them from still-operational debug/inspect/demo-data utilities, and stating that new schema changes go through Alembic only. Resolves the navigability/confusion problem the audit flagged without rotting doc links.
- [x] **P2-14 — Resolve `@deprecated` markers in active code.** ✅ Both markers sat on still-load-bearing exports, so the `@deprecated` tag (implies "removable") was misleading. `getChildType` (4 valid single-default-child call sites) and `chartDefaults` (~12 components, ~70 sites) reworded to accurate guidance notes. The real `chartDefaults → useChartOptions` theme migration re-scoped as P3-24.
- [ ] **P2-15 — Reduce `legacy` serializer branches** in [services/serializers.py](../services/serializers.py) (`_merge_legacy_activity_payload`, legacy `session_data`/`sets` reconcile ~195–597); data-migrate old rows if possible.

## P3 — Hardening & polish

- [ ] **P3-16 — Standardize empty/no-data states** into one shared component.
- [ ] **P3-17 — Add a hard LOC budget to the maintainability audit** ([client/scripts/maintainability-audit.mjs](../client/scripts/maintainability-audit.mjs)); CI gate at ~800 LOC so P1 doesn't recur.
- [ ] **P3-18 — Verify N+1 batching for the landing snapshot publish path** (`_serialize_public_goal_tree` + `_enrich_landing_tree_with_history`); add query-count assertion.
- [ ] **P3-19 — Document the analytics service topology** (5 overlapping services) in a `docs/architecture/` ADR.
- [ ] **P3-20 — Centralize the tier enum** (`"legacy"`/`"free"`/`"paid"` hardcoded across quota_service.py, Admin.jsx).
- [ ] **P3-21 — Retire `progress_service` legacy aggregation / `metrics_multiplicative` fallback** once no rows depend on it. — progress_service.py:152
- [ ] **P3-22 — Split `Admin.jsx` (1,452) and `ProgramCalendarPage.jsx` (1,319)** into per-tab/per-view subcomponents + hooks.
- [ ] **P3-23 — Migrate the 6 remaining `read_model_sql` analytics charts to catalog-backed SQL** (re-scoped from P0-4). These are correctly labeled today; goal is to expose the missing catalog lineage/section fields so they become directly runnable + console-openable. Source of truth: `client/src/components/analytics/visualizationQueryExplanations.js` (`execution: 'read_model_sql'`).
- [ ] **P3-24 — Migrate direct `chartDefaults` consumers to `useChartOptions`** (re-scoped from P2-14). ~12 chart components / ~70 sites read static `chartDefaults` colors instead of the theme-reactive hook. Behavior-affecting (theme colors); do per-component with visual checks. — `client/src/components/analytics/ChartJSWrapper.jsx`

---

## New findings (discovered during remediation)

- [x] **NF-1 — 3 pre-existing landing test failures on `main`/HEAD.** ✅ **Fixed.** Root cause was a test-fixture bug, not production code: both fixtures created `AnalyticsDashboard` rows intended as analytics *views* but omitted `kind='view'`, so the model default `kind='dashboard'` made them invisible to the (correct) `kind == "view"` query in the options/publish paths. Added `kind='view'` to both fixtures. All 38 admin tests now pass — which also re-confirms P0-1's extraction is behavior-preserving.

## Progress log

| Date | Item | Notes |
|------|------|-------|
| 2026-06-29 | — | Audit completed, tracking doc created. |
| 2026-06-29 | P0-3 | Deleted dead `legacyApi` (module + re-exports + test cases). |
| 2026-06-29 | P0-2 | Consolidated 4 `formatDuration` reimplementations onto canonical formatters. |
| 2026-06-29 | P0-1 | Extracted `LandingPublishService` from AdminService (1710→631 LOC). Found NF-1 (pre-existing landing test failures). |
| 2026-06-29 | P0-4 | Investigated: false positive. No competing render path; catalog/read-model split already governed. Re-scoped residual to P3-23. |
| 2026-06-29 | NF-1 | Fixed landing fixtures missing `kind='view'`; all 38 admin tests pass. |
| 2026-06-29 | P2-13 | Labeled pre-Alembic python-scripts historical in README (kept paths for docs). |
| 2026-06-29 | P2-14 | Reworded misleading `@deprecated` tags; re-scoped chartDefaults migration to P3-24. |
| 2026-06-29 | P2-11 | Added `utils/logger.js`; migrated 72 `console.error` → `logError` across 27 files. |
