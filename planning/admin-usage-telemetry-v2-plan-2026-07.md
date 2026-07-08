# Admin Usage/Telemetry v2 — DAU Chart, Date Filters, Full Event Analytics, Admin-Only Logs, BigQuery Export

## Context

The S-rank pass shipped a working but minimal usage dashboard: the DAU visualization is a barely-visible CSS strip, filtering is fixed 7/30/90-day buttons, only 2 of ~45 domain event types are surfaced, telemetry storage is unmanaged from the UI, and there is no warehouse export. This plan upgrades the admin analytics surface into a real product-analytics tool and wires nightly BigQuery export.

**User decisions (confirmed):**
- BigQuery export: **Cloud Run job + Cloud Scheduler**, `google-cloud-bigquery` dep, incremental watermarks in `app_settings`. Tables: `product_events`, `event_logs`, `email_delivery_events` + `users` dimension.
- `product_events` stays **admin-only** (no user-facing analytics dataset this round).
- **Logs page becomes admin-only** (nav link hidden + route gated for non-admins); `event_logs` becomes the backbone of admin analytics stats.
- Events view v1: **full breakdown table** (all event types, count + distinct users, domain filter); DAU stays the only chart.

**Facts that shape the design (verified):**
- Chart.js 4 + react-chartjs-2 already installed; `ChartJSWrapper.jsx` provides theme hooks; `SessionTrends.jsx` is the bar-chart pattern to copy. Admin is already a lazy route chunk — direct import is fine.
- The analytics Time Range control (7D/30D/90D/6M/1Y/All/Custom + date inputs) is inline JSX in `AnalyticsFiltersSidebar.jsx` (lines ~15–52, ~204–225, ~276–314) — extract, don't duplicate.
- All domain events already persist to `event_logs`; root-fractal creation is NOT a gap (`_goal_crud.py:126` self-assigns `root_id` pre-emit) — lock with a regression test only.
- `LogsModal.jsx` is dead code (no importers). Alembic head is singular (`4c5d6e7f8a9b`).
- `event_logs` currently counts toward user storage quotas (`quota_service.py:~267`) — contradictory once logs are admin-only; remove.
- The user analytics engine keeps its `event_logs` dataset (user's own data; saved views may reference it) — **intentionally retained**, only the Logs page/nav is gated.

## Database Grading (current DB vs. this plan): **C+**

| Area | Grade | Why |
| --- | --- | --- |
| `product_events` | A | Shipped yesterday with `(created_at)`, `(user_id, created_at)`, `(event_name, created_at)` — covers every new query incl. export keyset |
| `event_logs` | C- | Root-scoped indexes only; the new admin-wide `WHERE timestamp >= X GROUP BY event_type` breakdown and the export cursor `(timestamp, id)` seq-scan today |
| `email_delivery_events` | B- | `created_at` unindexed — exactly what `_email_health` filters and the export cursors on |
| `app_settings` | A- | JSON K/V + `updated_at` is the right home for `telemetry_retention` and `analytics_export_state` watermarks |
| Quota coupling | C | `EventLog` bytes count against user quotas while becoming admin infrastructure users can't see or clear |

**Path to S:** one migration (two composite indexes) + quota decoupling closes every gap; zero new tables/columns.

---

## Phase 0 — Schema + correctness groundwork (S)

1. **Migration** `migrations/versions/<rev>_add_global_event_export_indexes.py` (chain off `4c5d6e7f8a9b`; style of `f4c9a7b2d1e0_add_event_log_indexes.py`):
   - `ix_event_logs_timestamp_id ON event_logs (timestamp, id)` — serves both the admin window aggregation and export keyset pagination (preferred over `(event_type, timestamp)`: the breakdown filters on timestamp only and groups all types).
   - `ix_email_delivery_events_created_at_id ON email_delivery_events (created_at, id)`.
   - Mirror both in model `__table_args__` (`models/common.py` EventLog, `models/user.py` EmailDeliveryEvent).
2. **Quota decoupling**: remove the `EventLog` block from `QuotaService.get_storage_usage_bytes` (`services/quota_service.py` ~:267). No quota test references EventLog. Note user-visible effect: storage numbers drop slightly.
3. **Regression test**: parentless-goal creation emits `GOAL_CREATED` with `data['root_id'] == goal.id` (subscribe a test handler on the event bus) — locks the invariant `event_logger` depends on.

## Phase 1 — Backend: usage summary v2 (M/L)

1. **New `services/app_settings.py`**: `get_app_setting(db, key, default)` / `set_app_setting(db, key, value)` copying the deepcopy-read + get-or-create + `flag_modified` pattern from `landing_publish_service.py:91–104`. Keys: `telemetry_retention` → `{"product_events_days": 180}`; `analytics_export_state` → per-table watermarks + `last_run_at`/`last_run_status` (written by Phase 4, displayed here).
2. **`services/admin_usage_service.py`**:
   - `usage_summary(start=None, end=None, days=None)` — ISO dates, swap if reversed, `end` defaults today, `start` defaults `end-29d`, span clamped to `MAX_WINDOW_DAYS=365` (deliberate: no unbounded scans; "All" is clamped). `days` kept as fallback for compat. Payload gains `"window": {start, end, days}`; `window_days` retained.
   - `_active_users`: DAU buckets iterate `start..end` dates; WAU/MAU stay rolling (anchored to now) — documented.
   - **New `_events_breakdown`**: one query — `EventLog.event_type, count, count(distinct Goal.owner_id)` joined `Goal ON EventLog.root_id == Goal.id`, grouped by event_type, ordered by count desc (~45 rows max). Serialize `{event_type, domain: first dot-segment, count, users}`.
   - Per-user table: keep sessions/goals created, add `total_events` (all EventLog in window per owner).
   - **New `_storage_stats`**: hardcoded allowlist `[product_events, event_logs, email_delivery_events, email_webhook_events]` → row count, oldest/newest timestamp (ORM), bytes via `SELECT pg_total_relation_size(...)` (table name from the allowlist, never user input); non-Postgres/dialect failure → `bytes: None`.
   - **New `_settings_and_export_state`**: payload keys `retention` + `export` (watermarks, last run) from app_settings.
   - `prune_product_events(older_than_days=None)` — None → stored retention default. New `update_retention(payload)` clamped `[30, 730]`.
3. **`blueprints/admin_api.py`**: `get_admin_usage` passes `start`/`end`/`days`; new `PATCH /api/admin/usage/retention` (new `AdminUsageRetentionSchema` in `validators/`, registered in `validators/__init__.py`); prune passes optional body value through.
4. **Tests** (`tests/integration/test_admin_usage_api.py`): start/end honored + echo; swap; >365 clamp; days fallback; breakdown counts + distinct users across two owners; per-user `total_events`; storage stats rows/bytes; retention PATCH round-trip + clamps; prune uses stored retention; non-admin 403s.

## Phase 2 — Frontend: DateRangeFilter, DAU chart, breakdown + storage UI (L)

1. **New `client/src/utils/dateRange.js`**: move `DATE_PRESET_OPTIONS`, `toISODate`, `getMatchingPreset` from `AnalyticsFiltersSidebar.jsx` + new `presetToRange(preset)` (currently inline in `handlePresetClick`). Pure + unit-tested.
2. **New `client/src/components/common/DateRangeFilter.jsx`** (+ module CSS): props `{value: {start,end}, onChange, presets, classNames={}}`; owns the sticky custom-preset state; renders preset chips + two `<input type="date">` in custom mode. `classNames` prop lets Analytics pass its existing `sessions-query-*` classes so the sidebar stays pixel-identical. Refactor `AnalyticsFiltersSidebar.jsx` to consume it — **behavior-neutral; existing Analytics tests must stay green**.
3. **UsagePanel rework** (`client/src/components/admin/`):
   - `UsagePanel.jsx` orchestrates: `dateRange` state (default `presetToRange('30d')`), query key `['admin','usage',start,end]`, `adminApi.getUsage({start,end})`, `<DateRangeFilter presets={['7d','30d','90d','6m','1y','custom']}>` (omit `all`; backend clamps anyway).
   - **New `DauBarChart.jsx`**: `<Bar>` from react-chartjs-2 + `useChartThemeDefaults`/`useChartOptions`/`DISABLED_CHART_ANIMATION` from `../analytics/ChartJSWrapper`, modeled on `SessionTrends.jsx` — date x-axis labels, `beginAtZero` integer y ticks, tooltips, `role="img"` aria-label. Delete `.dauStrip` CSS from `Admin.module.css`.
   - **New `EventsBreakdownTable.jsx`**: domain filter chips (derived from payload) + text search; columns Event / Domain / Count / Users; empty state.
   - **New `UsageStoragePanel.jsx`**: 4-table stats (rows, oldest, newest, human bytes / "n/a"), retention input + Save (`adminApi.updateUsageRetention`, invalidate), Prune with confirm + deleted count, "Last BigQuery export" line from `export` payload ("Never exported" fallback).
   - `adminApi.js`: add `updateUsageRetention`.
4. **Tests**: update `UsagePanel.test.jsx` fixture (window/breakdown/storage/retention/export/total_events; assert `{start,end}` params; mock `react-chartjs-2` Bar); new tests for `EventsBreakdownTable`, `UsageStoragePanel`, `DateRangeFilter`, `dateRange.js`; extend `Admin.test.jsx` mock; re-run Analytics sidebar tests to prove refactor neutrality.

## Phase 3 — Admin-only Logs (M)

1. **`client/src/AppRouter.jsx`**: `NavigationHeader` gains `useAuth()`; render the Logs nav link (mobile + desktop blocks) only when `user?.is_admin`. Gate the `/:rootId/logs` route with a small `RequireAdmin` wrapper (non-admin → `Navigate` to `/${rootId}/goals`).
2. **Delete dead code**: `client/src/components/modals/LogsModal.jsx` + its test (no importers).
3. **Backend gating** (recommended split): keep `GET /api/<root_id>/logs` **owner-scoped** (data remains user-readable via their analytics `event_logs` dataset anyway — gating reads would be inconsistent), but **admin-gate `DELETE /api/<root_id>/logs/clear`** in `blueprints/logs_api.py` — users no longer have UI for it, and self-clearing would destroy admin analytics history and un-exported BQ rows. Update `tests/integration/test_logs_api.py`: owner GET 200, owner clear 403, admin clear 200.
4. Document the retained user-facing analytics dataset as an explicit decision (index.md).

## Phase 4 — BigQuery export (M/L)

1. **Dep**: `google-cloud-bigquery` pinned in `requirements.txt` (alongside `google-cloud-storage==2.14.0`).
2. **New `services/analytics_export_service.py`** (BQ client injected for testability):
   - Table specs: `product_events` cursor `(created_at,id)`, `event_logs` `(timestamp,id)`, `email_delivery_events` `(created_at,id)`; `users` dimension (id, username, email, role, is_active, membership_tier, created_at, last_login_at — **no password/preferences**).
   - `run_export(db, bq_client, dataset, now=None)`: watermarks from `app_settings['analytics_export_state']`; per table keyset-paginate `WHERE (ts,id) > (last_ts,last_id) AND ts < now - LAG ORDER BY ts,id LIMIT 5000` — **LAG = 10 min** (event_logger writes from a thread pool; late commits with earlier timestamps must not be skipped). Load via `load_table_from_json` + `WRITE_APPEND` (free-tier load jobs, atomic); persist watermark only after each successful load (commit per table). `users`: `WRITE_TRUNCATE` full refresh. Write `last_run_at`/`last_run_status`/row counts into the same setting (displayed in admin panel). Crash between load and watermark-commit can duplicate one batch — accepted for beta; dedupe view documented.
   - Env: `BIGQUERY_DATASET` (default `fractal_analytics`), project via ADC.
3. **New `scripts/export_analytics_to_bigquery.py`**: standalone entrypoint (sys.path bootstrap like `db_migrate.py`), engine from `SUPABASE_DIRECT_DATABASE_URL`, real `bigquery.Client()`, non-zero exit on failure.
4. **`cloudbuild.yaml`**: one `gcloud run jobs update export-analytics` step after migrations (image, direct-DB secret, `BIGQUERY_DATASET`, command `python scripts/export_analytics_to_bigquery.py`) — **update only, never execute in the build**.
5. **New `docs/bigquery-export.md`**: one-time setup — `bq mk` dataset; initial `gcloud run jobs create export-analytics ...` (cloudbuild only updates — the job must exist before the next deploy, same footgun as migrate-db, call out prominently); IAM (`roles/bigquery.dataEditor` on dataset + `roles/bigquery.jobUser` for `fractal-runtime@...`); Cloud Scheduler nightly job hitting the Cloud Run jobs run API with an invoker SA; per-table dedupe view DDL; first-run backfill note.
6. **Tests** `tests/unit/services/test_analytics_export_service.py` with a `FakeBigQueryClient`: fresh run exports all + sets watermarks; incremental second run; lag-window rows deferred then picked up; load failure → that table's watermark not advanced, earlier tables' persist; users dim truncates; JSON columns serialized. No network/BQ in CI.

## Phase 5 — Docs + planning updates (S)

- `index.md`: usage v2 (date ranges, events breakdown, storage panel, export state), Logs admin-only + quota accounting change, BigQuery export pointer.
- `planning/beta-readiness-s-rank-plan-2026-07.md`: mark delivered S+ stretch items (usage depth, retention management, warehouse export); record the retained user `event_logs` analytics dataset decision.

## Ordering & sizes

0 (S, unblocks 1+4) → 1 (M/L) → 2 (L) ‖ 3 (M) ‖ 4 (M/L, only touchpoint with 2 is the export-state display) → 5 (S).

## Verification

- `./run-tests.sh backend` + `frontend` green, including untouched Analytics sidebar tests (refactor neutrality).
- Live: run the app, browse pages, open Admin overview → DAU renders as a real bar chart with axes; switch presets and a custom range → counts change and `window` echoes; events breakdown lists domain-filtered event types; storage panel shows table sizes; save retention then prune with empty body → uses saved value.
- Logs: as non-admin the nav link is absent and `/:rootId/logs` redirects; as admin both work; owner `DELETE /logs/clear` → 403.
- Export: run `python scripts/export_analytics_to_bigquery.py` locally against a fake/emulated client via the unit tests; real BQ validated during the ops setup from `docs/bigquery-export.md`.
- Migration: `python db_migrate.py upgrade` applies the index migration locally.

## Risks

1. Alembic head must remain singular when the migration lands (verified singular now: `4c5d6e7f8a9b`).
2. AnalyticsFiltersSidebar refactor must preserve the sticky custom-preset semantics and UTC date math — existing tests are the guard.
3. Watermark vs. thread-lagged event timestamps — mitigated by the 10-minute lag window.
4. `gcloud run jobs update` fails if `export-analytics` was never created — the setup doc's `jobs create` must run before the next deploy.
5. User storage-usage numbers visibly drop after quota decoupling — communicate.

## Implementation Status — 2026-07-08

All planned phases are implemented:

- Phase 0: global export indexes, model index mirrors, quota decoupling, and root-goal event logging regression coverage.
- Phase 1: usage summary v2 with date windows, all-event breakdown, per-user total events, storage stats, retention settings, and export-state payload.
- Phase 2: shared `DateRangeFilter`, real DAU Chart.js bar chart with axes, event breakdown table, storage/retention/export UI, and targeted frontend tests.
- Phase 3: Logs nav/route is admin-only, log clearing is admin-only, owner read access is retained, and dead `LogsModal` code/tests were removed.
- Phase 4: BigQuery exporter service, Cloud Run job entrypoint, Cloud Build job update, dependency, setup doc, and fake-client unit coverage.
- Phase 5: `index.md` and beta readiness notes updated.

Targeted verification:

- `fractal-goals-venv/bin/pytest tests/integration/test_logs_api.py tests/integration/test_admin_usage_api.py tests/unit/services/test_analytics_export_service.py tests/unit/test_services_critical.py -q --no-cov` — 44 passed.
- `npm test -- --run src/__tests__/AppRouter.test.jsx src/utils/__tests__/dateRange.test.js src/components/common/__tests__/DateRangeFilter.test.jsx src/components/admin/__tests__/UsagePanel.test.jsx src/components/admin/__tests__/EventsBreakdownTable.test.jsx src/components/admin/__tests__/UsageStoragePanel.test.jsx src/pages/__tests__/Admin.test.jsx` — 35 passed.

Note: the same backend slice without `--no-cov` also had 44 tests pass but exited non-zero because the repo-wide coverage threshold is not meaningful for a targeted subset.
