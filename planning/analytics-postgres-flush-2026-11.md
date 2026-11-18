# Flush exported analytics out of Supabase

## Context

Analytics rows land in Supabase Postgres (`product_events`, `web_events`). The project is on the free tier, which allows 500 MB. A nightly `export-analytics` Cloud Run job already copies new rows to BigQuery. It is safe: the progress marker for each table moves forward only after its BigQuery load succeeds.

The cleanup is separate and doesn't know about the export:
- `DataRetentionService.prune` deletes rows by age only: up to 180 days for `product_events` (the admin setting allows 30–180) and 90 days for `web_events`.
- So Postgres keeps up to six months of rows that are already in BigQuery.
- If the export stops, the age-based delete still removes rows that never reached BigQuery.

**Goal:** Postgres keeps only a short live window of rows that have already reached BigQuery. BigQuery keeps the history. The admin dashboard says where older data is. You can see how close the database is to its quota before you hit it.

**`event_logs` is out of scope for deletion.** It isn't analytics data. It is product history:
- `goal_history_read_model.py` and `goal_evidence_query.py` read association events with no time limit, so deleting them changes goal timelines and evidence.
- The per-fractal activity log page and its "Clear logs" action read it too.
- Privacy policy §8 promises to keep it "for as long as your account exists".

Instead, this plan adds a measurement of its payload size, so any later decision is based on real numbers.

## Grade of the current system: **C+**

| Area | Grade | Evidence |
|---|---|---|
| Getting rows to BigQuery | A | Keyset progress markers, moved only after a load succeeds; erasure queue; partition expiry |
| Cleaning up Postgres | D | Deletes by age only and ignores the export. Already-exported rows stay up to 180 days. A stalled export can lose rows that never reached BigQuery |
| Seeing quota risk | C | The storage panel shows sizes, but has no quota, no headroom and no warning |
| Dashboard honesty | B | A range of up to 365 days can silently read a table that only holds 180 days |
| `event_logs` growth | ? | Not measured. Full `payload` (`evt.data`) and `description` are stored for every domain event |

## S+ plan

### 1. Flush after export (the core)
In `services/analytics_export_service.py`:
- Add `flush_after_export: bool` to `IncrementalTableSpec`. Set it True for `product_events` and `web_events` only. The email tables are kept for their published 24 months and are read by admin pages.
- Add a module function `flush_exported(db_session, now, live_days) -> dict[str, int]`. For each table marked for flushing that has a progress marker, delete the Postgres rows that meet both conditions:
  - older than `now - live_days`
  - at or before the marker, i.e. `(created_at, id) <= (last_ts, last_id)`. This reuses `_parse_dt` and `_db_datetime`.

  Rows that haven't been exported are never deleted. A table that has never exported flushes nothing.
- `run_export` calls `flush_exported` after each table's export succeeds, and reports `flushed` counts in the run result and `last_run_rows`. A table that fails is not flushed, because the exception skips the call.
- **Live window:** default 35 days. That covers the 30-day default admin range plus a margin, and stays under the published 90- and 180-day maximums. It comes from a new `ANALYTICS_LIVE_DAYS` setting (allowed range 30–180) in `config.py`, and the admin can change it.

### 2. Retention job becomes the legal ceiling only
`services/data_retention_service.py` deletes `product_events` at the fixed published maximum (`PRODUCT_EVENT_RETENTION_DAYS`, 180) and no longer reads the admin setting. `web_events` stays at 90 days. This is the safety net if the export stops for good: the policy limits still hold. The flush keeps storage small while the export is healthy.

### 3. Admin controls say what they do
- `services/admin_usage_service.py`:
  - Rename the stored retention setting to `{"live_days": n}`. Still read the old `product_events_days` key, so nothing is lost on deploy.
  - `prune_product_events` becomes `flush_exported_events`, which calls `flush_exported`. Remove `TelemetryService.prune` and its constant, which become dead code.
- Update the routes in `blueprints/admin_api.py` and the validator. Keep `/usage/retention` and `/usage/prune` as paths, and accept `live_days`.
- `client/src/components/admin/UsageStoragePanel.jsx`:
  - The setting becomes **"Keep in Postgres after export (days)"**.
  - The button becomes **"Flush exported events"**. Its confirmation says rows not yet in BigQuery are kept.
  - Show a warning when the last successful export is more than 48 hours old: *events aren't being flushed and will build up until it succeeds*.
  - The export status, which is already shown, also shows the last run's flushed counts.

### 4. Quota gauge
- Add `DATABASE_STORAGE_QUOTA_MB` to `config.py`, default 500 (Supabase free tier).
- `_storage_stats` returns `database.quota_bytes`.
- The storage panel shows **"123 MB of 500 MB"** with a `<progress>` bar. The bar is styled the same way as the funnel bars in `GrowthPanel`, and the panel warns at 80% or more.
- Note: Postgres doesn't hand freed space back to the operating system. After the first large flush, the database size stops growing rather than shrinking; autovacuum reuses the space. The panel says this in one line. A one-off `VACUUM FULL` is a manual step described in the docs, not something the app runs.

### 5. Dashboard says where older data is
- `usage_summary` returns `live_since`, the oldest row still in `product_events` and in `web_events`. `_storage_stats` already computes these, so reuse it.
- `UsagePanel` (DAU chart) and `GrowthPanel` (visitors chart) show a caption when the selected range starts before `live_since`: *"Days before 14 Oct are in BigQuery (see docs/bigquery-export.md)."*
- Weekly active practitioners (WAP) and the funnel read `event_logs`, `users` and `beta_signup_requests`, so the flush doesn't affect them. A test confirms this.

### 6. `event_logs`: measure, don't delete
The storage panel gets an "Activity history payloads" table: the top 10 `event_type` values by `count(*)`, `sum(pg_column_size(payload))` and `sum(pg_column_size(description))`, using a fixed query on Postgres only. With real numbers, a follow-up can decide whether to cap payload size for event types that no reader uses. That would change only what gets written, never the history that timelines depend on.

### 7. Policy and docs
- privacy.md §8: "Public website visit events | Up to 90 days". Version 1.3 hasn't been deployed yet, so the version stays as it is.
- `docs/data-retention.md`: explain the ceiling vs the flush.
- `docs/bigquery-export.md`: explain the flush step, the live window, and the one-off VACUUM note.
- `index.md`: update the summary.

## Critical files
- `services/analytics_export_service.py`, `services/data_retention_service.py`, `services/admin_usage_service.py`, `services/telemetry_service.py` (remove `prune`), `config.py`
- `blueprints/admin_api.py` plus the admin usage validator
- `client/src/components/admin/UsageStoragePanel.jsx`, `UsagePanel.jsx`, `GrowthPanel.jsx`, `client/src/utils/api` admin client
- `client/src/content/legal/privacy.md`, `docs/data-retention.md`, `docs/bigquery-export.md`, `index.md`

## Verification
- **Unit tests,** in `tests/unit/services/test_analytics_export_service.py` with the existing fake BigQuery client:
  - The flush deletes only rows that are both old and exported.
  - On a tie in `created_at`, the tie-break on `id` is respected.
  - With no marker, nothing is deleted.
  - When a table's load fails, nothing is flushed from it.
  - `run_export` reports `flushed`.
  - `email_*` tables are never flushed.
- **Unit tests,** in `test_data_retention_service.py`: the ceiling is 180/90 and ignores the admin setting.
- **Integration tests:**
  - `test_admin_usage_api.py`: `live_days` round-trips, the legacy key is still read, flush through the API, and `quota_bytes` and `live_since` are present.
  - `test_growth_metrics.py`: WAP doesn't change after a flush.
- **Frontend:** `UsageStoragePanel.test.jsx` covers the quota gauge and its 80% warning, the warning for a stale export, and the new labels. `UsagePanel` and `GrowthPanel` tests cover the `live_since` caption.
- **Full gates:** `./run-tests.sh backend frontend lint`.
- **Manual check:**
  1. Seed old events locally.
  2. Run `scripts/export_analytics_to_bigquery.py` with the fake client, or run the flush through the admin API.
  3. Confirm only exported rows older than 35 days are gone.
- After you approve it, save the plan as `planning/analytics-postgres-flush-2026-11.md`.
