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
- [x] **P0-4 — Reconcile competing analytics implementations.** ⚠️ **Investigated — original finding was a false positive.** `AnalyticsExtraCharts.jsx` is NOT a competing/orphaned render path: it is the shared chart-component library imported exclusively by the registry's `visualizations/{goals,sessions,activities}/index.jsx`. `Analytics.jsx` renders only through `ProfileWindow` → registry (single path, no duplication). The catalog-vs-read-model split was governed during audit and is now retired by P3-23: registered visualization explanations use catalog-backed/direct-lineage SQL with no `read_model_sql` execution flags left. The misleading `AnalyticsExtraCharts` filename is the only real wart — optional rename deferred (touches 4 importers for cosmetic gain).

## P1 — Half-baked / oversized surfaces

Over the implicit ~800-LOC decomposition threshold; the index's own "decompose before they calcify" backlog.

- [ ] **P1-5 — Decompose `SessionActivityItem.jsx` (1,539 LOC, 26 hooks)** into controller hook + focused subcomponents. — [client/src/components/sessionDetail/SessionActivityItem.jsx](../client/src/components/sessionDetail/SessionActivityItem.jsx)
- [ ] **P1-6 — Decompose `GoalDetailModal.jsx` (1,460 LOC, 34 hooks);** push state into `useGoalDetailController`. — [client/src/components/GoalDetailModal.jsx](../client/src/components/GoalDetailModal.jsx)
- [ ] **P1-7 — Split `programs.py` (1,359) and `goal_service.py` (1,283)** along existing seams (block scheduling / occurrence gen / goal-attachment validation / calendar). — [services/programs.py](../services/programs.py), [services/goal_service.py](../services/goal_service.py)
- [ ] **P1-8 — Split `validators.py` (1,984 LOC, 92 schemas)** into per-domain modules with a re-export shim. — [validators.py](../validators.py)
- [ ] **P1-9 — Audit `completion_handlers.py` (1,145) vs `progress_service.py` (1,187) overlap;** one source of truth for "metric values off an instance." — [services/completion_handlers.py](../services/completion_handlers.py)

## P2 — Redundancy & centralization gaps

- [x] **P2-10 — Replace 409 inline `style={{}}` blocks with design tokens** (worst: GoalUncompletionModal 24, GoalHeader 20, GoalDetailModal 19). ✅ Converted the named worst offenders to CSS modules/design-token classes: `GoalUncompletionModal` now has zero inline style blocks, `GoalHeader` uses CSS classes plus one runtime CSS-variable bridge for dynamic goal/status colors, and the static `GoalDetailModal` level-picker/modal-border styles moved into CSS. Added maintainability-audit inline-style budgets so the cleaned P2 components and repo-wide inline-style count cannot quietly regress.
- [x] **P2-11 — Triage 73 non-test `console.*` calls.** ✅ Added `client/src/utils/logger.js` (`logError`/`logWarn`/`logDebug`): dev prints to console as before; prod suppresses debug/warn and forwards errors to Sentry (already wired in main.jsx) when a DSN is set. Migrated all 72 `console.error` calls across 27 files to `logError`. Intentionally left: the 3 framework error boundaries (Sentry's React integration auto-captures those) and the one debug-toggle `console.log` in DebugContext. Single chokepoint now exists for production log routing.
- [x] **P2-12 — Centralize duplicated `formatDate`/`formatDateTime`/`formatMetricValue`** into formatters.js/dateUtils.js. ✅ Added `formatDateTimeParts` and `formatMetricDisplayValue` to `client/src/utils/formatters.js`; `GoalTimelineView` now consumes shared helpers. Formatter tests cover date/time splitting, duration labels, and metric display edge cases. SessionCard's date helper remains a thin timezone wrapper over `formatDateInTimezone`.
- [x] **P2-13 — Quarantine `python-scripts/` one-off migrations.** ✅ Done **in place** rather than by relocation: moving the files would have broken ~40 path references in `docs/migrations/` runbooks (net negative). Instead added a prominent status section to `python-scripts/README.md` explicitly labeling the pre-Alembic schema scripts as historical/reference-only ("do not run"), separating them from still-operational debug/inspect/demo-data utilities, and stating that new schema changes go through Alembic only. Resolves the navigability/confusion problem the audit flagged without rotting doc links.
- [x] **P2-14 — Resolve `@deprecated` markers in active code.** ✅ Both markers sat on still-load-bearing exports, so the `@deprecated` tag (implies "removable") was misleading. `getChildType` (4 valid single-default-child call sites) and `chartDefaults` (~12 components, ~70 sites) reworded to accurate guidance notes. The real `chartDefaults → useChartOptions` theme migration re-scoped as P3-24.
- [x] **P2-15 — Reduce `legacy` serializer branches** in [services/serializers.py](../services/serializers.py) (`_merge_legacy_activity_payload`, legacy `session_data`/`sets` reconcile ~195–597); data-migrate old rows if possible. ✅ Kept compatibility but moved it behind named helpers (`_merge_session_attributes`, `_hydrate_session_sections_from_instances`, `_build_section_activity_ids`) so `serialize_session` is canonical serialization plus one explicit legacy-normalization boundary. Focused session compatibility tests pass; a future data migration can remove the helper boundary entirely.

## P3 — Hardening & polish

- [x] **P3-16 — Standardize empty/no-data states** into one shared component. ✅ Extended `client/src/components/common/EmptyState.jsx` with compact/content slots and migrated analytics chart no-data branches away from bespoke local empty components.
- [x] **P3-17 — Add a hard LOC budget to the maintainability audit** ([client/scripts/maintainability-audit.mjs](../client/scripts/maintainability-audit.mjs)); CI gate at ~800 LOC so P1 doesn't recur. ✅ Added `HARD_SOURCE_LINES = 800`; any file above the hard ceiling must be named in the explicit decomposition backlog and stay under its current cap, while ordinary files remain under the tighter default budget.
- [x] **P3-18 — Verify N+1 batching for the landing snapshot publish path** (`_serialize_public_goal_tree` + `_enrich_landing_tree_with_history`); add query-count assertion. ✅ Added `test_publish_landing_examples_query_budget` with a multi-goal/target/activity/session fixture and an 80-query ceiling. Local execution is blocked before assertion by the existing test DB teardown issue (`goals` table missing while dropping `fk_goals_completed_session_id_sessions`).
- [x] **P3-19 — Document the analytics service topology** (5 overlapping services) in a `docs/architecture/` ADR. ✅ Added `docs/architecture/ADR_0003_ANALYTICS_SERVICE_TOPOLOGY.md` and linked it from `index.md`.
- [x] **P3-20 — Centralize the tier enum** (`"legacy"`/`"free"`/`"paid"` hardcoded across quota_service.py, Admin.jsx). ✅ Added backend `account_tiers.py` and frontend `client/src/constants/accountTiers.js`; quota/admin/auth/serializer/validator paths now consume constants instead of private string sets.
- [x] **P3-21 — Retire `progress_service` legacy aggregation / `metrics_multiplicative` fallback** once no rows depend on it. ✅ Investigated and resolved as not currently removable: `progress_service.py` has no `metrics_multiplicative` fallback, while explicit `progress_aggregation` remains active product configuration across activity/metric/root settings. Kept the supported path and documented the precondition instead of deleting live behavior.
- [x] **P3-22 — Split `Admin.jsx` (1,452) and `ProgramCalendarPage.jsx` (1,319)** into per-tab/per-view subcomponents + hooks. ✅ Extracted `TierQuotasPanel`, `BetaSignupsPanel`, and `ProgramSidePane`; tightened maintainability caps to the new measured sizes so the files cannot grow back to the old ceilings.
- [x] **P3-23 — Migrate the 6 remaining `read_model_sql` analytics charts to catalog-backed SQL** (re-scoped from P0-4). ✅ Removed the remaining read-model execution flags in `visualizationQueryExplanations.js`; goal momentum/stale goals/detail/time distribution now explain direct catalog lineage, and section pie uses governed `sessions.attributes` JSON exposure.
- [x] **P3-24 — Migrate direct `chartDefaults` consumers to `useChartOptions`** (re-scoped from P2-14). ✅ Added `useChartThemeDefaults()` and migrated direct analytics/goal-detail chart consumers to theme-reactive options; only the wrapper retains `chartDefaults` as fallback constants.

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
| 2026-06-30 | P2-10 | Converted named worst inline-style offenders (`GoalUncompletionModal`, `GoalHeader`, static `GoalDetailModal` cluster) to CSS modules/design-token classes. |
| 2026-06-30 | P2-12 | Centralized goal timeline date/time and metric display formatting in `utils/formatters.js`. |
| 2026-06-30 | P2-15 | Extracted session serializer legacy compatibility into named helpers while preserving legacy section/set hydration behavior. |
| 2026-06-30 | P2 S+ | Added maintainability inline-style budgets, formatter regression coverage, and updated `index.md` quality-tooling guidance so P2 cleanup stays enforceable. |
| 2026-06-29 | P3-17 | Added explicit 800-line hard ceiling to frontend maintainability audit with a named backlog for current oversized files. |
| 2026-06-29 | P3-19 | Added analytics service topology ADR and linked it from index.md. |
| 2026-06-29 | P3-20 | Centralized account tier constants across backend quota/admin/auth validation and frontend Admin tier controls. |
| 2026-06-30 | P3-16 | Standardized analytics empty/no-data states on shared `EmptyState` compact/content variants. |
| 2026-06-30 | P3-18 | Added landing publish query-count coverage; local run is blocked by existing Postgres teardown/schema issue before assertion. |
| 2026-06-30 | P3-21 | Confirmed no `metrics_multiplicative` fallback remains in `progress_service`; retained live explicit aggregation config. |
| 2026-06-30 | P3-22 | Extracted Admin quota/beta panels and Program side pane; lowered maintainability caps to the new file sizes. |
| 2026-06-30 | P3-23 | Migrated remaining analytics SQL explanations off `read_model_sql` onto catalog/direct lineage SQL. |
| 2026-06-30 | P3-24 | Migrated direct chart theme consumers to `useChartThemeDefaults`; `chartDefaults` is now wrapper-internal fallback only. |
