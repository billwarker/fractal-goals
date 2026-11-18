# Fix the analytics audit's findings

## Context

The audit of the analytics work (tracking, the flush, the Overview sub-tabs) graded it **B+**. The pipeline was A−, and the dashboard and operations held it back. This plan fixes all ten findings plus the three smaller points, aiming for an S rating across the board. The current grades and their evidence are in the audit. This plan is the path to S+.

## Fixes

### Metric correctness
1. **One definition of a sign-up.** `_signups_by_day` (`services/admin_usage_service.py`) uses the funnel's role filter: `EXCLUDED_ROLES` from `services/growth_metrics_service.py`, which leaves out demo and admin accounts. The KPI and the funnel then agree. Add a test that puts a demo account and an admin account in the window.
2. **"First fractal" ignores deleted roots.** `_funnel` adds `Goal.deleted_at.is_(None)`. This matches `AdminService.summary`.
3. **Funnel groups are honest** (audit #10).
   - Each step carries `stage`: `"public"` for visitors, demo, waitlist and invited, which are counted on their own. `"cohort"` is for signed up, first fractal and activated, which all follow the window's sign-ups.
   - The funnel table shows two labelled groups: *Before sign-up · counted independently* and *After sign-up · this window's sign-ups*.
   - "From previous" is calculated within a group only. Across the group boundary it shows "–".
   - "From visitors" appears only for public steps.

   The Summary KPI "Visitor → sign-up" is relabelled **"Sign-ups per visitor"**, which is accurate for a ratio of two independent counts.

### Dashboard usefulness
4. **Loading isn't zero** (audit #2). The account totals show "–" until the summary request returns, and "unavailable" if it fails. No more `|| 0` placeholders in `Admin.jsx`.
5. **Event charts start where the data starts** (audit #3).
   - The server starts the DAU series (`_active_users`) and the visitors series (`GrowthMetricsService._traffic`) at whichever is later: the window start or the oldest event Postgres holds.
   - That oldest-event value is `live_since`, read with a cheap `min()` over the `created_at` index.
   - So a 6-month or 1-year range shows a chart of real days instead of months of empty bars.
   - `LiveSinceNote` changes to *"Charts start 14 Oct, the oldest day Postgres holds; earlier days are in BigQuery."*
   - Sign-ups, domain events, the funnel and email keep the full window, because their tables aren't flushed.
6. **Storage data loads with the System tab** (audit #6).
   - New endpoint `GET /api/admin/usage/storage` returns storage, retention, the export state and job health.
   - `usage_summary` drops those fields and keeps only `live_since`.
   - The System tab loads storage with its own query (`['admin','usage','storage']`), so the existing invalidation of `['admin','usage']` still refreshes it.
   - The full `event_logs` scan runs only when someone opens System.
7. **A failed storage query no longer breaks the request** (audit #7). `_table_bytes`, `_database_storage_breakdown` and `_event_log_payloads` each run inside `db_session.begin_nested()`. A failure rolls back that savepoint only and returns the existing "unavailable" values. Add a test with a query that's forced to fail.
8. **Naming.** The Overview sub-tab "Users" becomes **"People"**, so it isn't confused with the top-level users tab.

### Accessibility and tests
9. **Tabs follow the keyboard pattern** (audit #8). `ViewToggleTabs` (`components/common`), in its `tabs` semantics only:
   - Arrow keys move between tabs and select them; Home and End jump to the first and last.
   - Only the selected tab is in the Tab order.
   - An optional `idPrefix` gives each tab an `id` and `aria-controls`.
   - The Overview `tabpanel` uses `aria-labelledby` to point at its tab.

   The `radio` mode keeps its native behaviour. The other users of the component get the keyboard fix automatically.
10. **A permanent browser test** (audit #9). New `client/e2e/admin-overview.spec.js`:
    - signs in as the e2e admin
    - checks the account totals load as numbers, not "–", which proves #4 works
    - walks every tab
    - checks that `?view=` survives a reload
    - checks at 390px wide that there's no sideways page scroll
    - opens System and sees the quota bar

### Privacy and compliance
11. **§8 says what the warehouse keeps** (audit #4).
    - The signed-in events row becomes *"Up to 180 days in our live database (usually 35)"*.
    - The public website events row becomes *"Up to 90 days in our live database (usually 35)"*.
    - The internal analytics row becomes *"24 months, including the de-identified copy of the usage and website events above"*.

    Version 1.3 hasn't been deployed yet, so it stays 1.3.
12. **Tighter bot filter.** Swap the broad `preview` pattern in `services/web_telemetry_service.py` for named preview agents: `bingpreview|skypeuripreview|whatsapp|embedly`, with `facebookexternalhit` kept. Add a unit test showing that a normal browser user agent containing "Preview" isn't dropped.

### Operations (audit #5)
13. **The export job creates the warehouse views.**
    - Move the dedupe and reporting SQL from `docs/bigquery-export.md` into `services/analytics_views.sql`, with `{dataset}` as a placeholder.
    - After a successful run, `AnalyticsExportService` runs each `CREATE OR REPLACE VIEW` statement. If one fails, the run logs it and records it in the state as `views_error`, but doesn't fail, because the data is already loaded.
    - The docs point to the file instead of holding copies.
    - Tested with the fake BigQuery client: every statement runs and the dataset name is substituted.
14. **Missed scheduled runs are visible.**
    - `scripts/run_data_retention.py` records `data_retention_state` (`last_run_at`, `last_success_at`, counts) in `app_settings`.
    - The storage endpoint returns `jobs: {export, retention}`.
    - The System tab shows a **Scheduled jobs** row, with a warning when either job has no success in the last 48 hours. That replaces the export-only warning.

    If either Cloud Scheduler trigger was never created, the page now says so.
15. **Policy re-acceptance** is a rollout decision, not a code change. The rollout note in `planning/product-analytics-tracking-2026-11.md` moves into a "Before deploying" checklist: the scheduler triggers, the dataset IAM, the §16 notice, and the re-acceptance prompt.

## Critical files
- Backend:
  - `services/admin_usage_service.py`, `services/growth_metrics_service.py`, `services/analytics_export_service.py`
  - new `services/analytics_views.sql`
  - `services/web_telemetry_service.py`, `services/data_retention_service.py`, `scripts/run_data_retention.py`
  - `blueprints/admin_api.py` (storage route)
- Frontend:
  - `client/src/pages/Admin.jsx`
  - `client/src/components/admin/` (`UsagePanel`, `UsageSystemView`, `UsageStoragePanel`, `usageParts` `FunnelTable`, `UsageSummaryView`, `LiveSinceNote`)
  - `client/src/components/common/ViewToggleTabs.jsx`
  - `client/src/utils/api/adminApi.js`
  - new `client/e2e/admin-overview.spec.js`
- Policy and docs: `client/src/content/legal/privacy.md`, `docs/bigquery-export.md`, `docs/data-retention.md`, `index.md`, and the planning docs

## Verification
- **Backend tests:**
  - demo and admin accounts are left out of sign-ups
  - deleted roots aren't counted as a first fractal
  - funnel stages
  - the DAU and visitors series start at `live_since`
  - the storage endpoint returns what Admin needs and requires admin access
  - a failed savepoint doesn't break the rest of the request
  - the views are applied, and a view failure doesn't fail the export
  - retention records its state
  - the bot filter
- **Frontend tests:**
  - Admin shows "–" while loading
  - the funnel's groups and rates
  - People tab sorting
  - keyboard navigation in `ViewToggleTabs`, including its other users
  - the System tab fetches its own data, and the job-health warnings
- **Gates:**
  1. `./run-tests.sh backend frontend lint`
  2. rebuild `client/dist`
  3. run the new `admin-overview.spec.js` plus the `admin-live-demo`, `public-telemetry` and `settings-storage` browser tests
- After approval, save the plan as `planning/analytics-audit-fixes-2026-11.md`.
