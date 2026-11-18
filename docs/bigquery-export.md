# BigQuery Analytics Export

Fractal Goals exports admin analytics tables from Postgres to BigQuery through
a Cloud Run job named `export-analytics`. Cloud Build updates the job image and
environment on each deploy, but it does not execute the job.

## Exported Data

- `product_events`: incremental append by `(created_at, id)`, with the batch context
  (`schema_version`, `visit_id`, `surface`, `app_version`).
- `event_logs`: incremental append by `(timestamp, id)`. Payloads and descriptions are
  never exported; `owner_user_id` (the fractal owner, loaded once per batch) makes the
  structural event attributable to an account.
- `web_events`: incremental append by `(created_at, id)`. Anonymous public-site events
  (landing, demo, waitlist): no user, IP or user agent; `visitor_day_hash` changes daily.
- `email_delivery_events`: incremental append by `(created_at, id)`.
- `email_webhook_events`: incremental append by `(created_at, id)`.
- `users`: full dimension refresh with `WRITE_TRUNCATE`.

The users dimension includes only account analytics fields: `id`, `username`,
`email`, `role`, `is_active`, `membership_tier`, `created_at`, `last_login_at`,
and `acquisition_source` (the waitlist source copied at sign-up, or `invite`). It intentionally excludes password hashes, preferences, quota
overrides, and other private account internals. The export job does not export
Supabase platform metadata, auth schema internals, storage metadata, Postgres
catalogs, or database storage-inspection rows.

Every BigQuery load includes an explicit schema and uses `CREATE_IF_NEEDED`, so
first-run backfills create `event_logs` and the other analytics tables even
when the dataset starts empty.

Append loads allow field addition, so a column added to an export schema (as above)
is added to the existing BigQuery table on its next load.

**Erasure.** Permanently deleting an account queues its id in `analytics_erasures`.
Each run deletes that id's rows from `product_events` (`user_id`), `event_logs`
(`owner_user_id`) and `email_delivery_events` (`recipient_user_id`), then clears the
queue; a failed delete fails the run and leaves the queue for the next one. Tables
created before a column existed are skipped for it: their older rows never held the id.

Incremental table watermarks live in `app_settings.analytics_export_state` and
are advanced only after the matching BigQuery load job succeeds. Rows newer
than ten minutes are deferred so thread-delayed event writes are not skipped.
A crash after a BigQuery load but before the watermark commit can duplicate one
batch; use the dedupe views below for downstream queries.

**Flush after export.** BigQuery is where analytics history lives; Postgres keeps
only a live window for the admin dashboard. After `product_events` or `web_events`
loads, the run deletes that table's Postgres rows that are both older than the live
window (default 35 days, `ANALYTICS_LIVE_DAYS`; Admin → Usage → "Keep in Postgres after
export") and at or behind its watermark `(created_at, id)`. A row is never deleted
before it is in BigQuery, a failed load flushes nothing, and a table that has never
exported keeps everything. The run reports the counts as `flushed` (and in
`last_run_flushed`); Admin → Usage → "Flush Exported Events" runs the same flush.
`event_logs` and the email tables are never flushed: activity history is product data
kept for the life of the account, and the email records keep their published 24 months.
If the export stops, `scripts/run_data_retention.py` still enforces the published
ceilings (180 days for product events, 90 for website events), and the admin storage
panel warns after 48 hours without a successful run.

Postgres reuses the space deleted rows free rather than returning it, so the database
size levels off after the first large flush instead of dropping. To reclaim it at
once, run `VACUUM FULL product_events, web_events;` from the Supabase SQL editor at a
quiet time (it locks both tables while it runs). Admin → Usage shows the total against
`DATABASE_STORAGE_QUOTA_MB` (default 500, the Supabase free tier).

## One-Time Setup

Important: the next deploy will fail at the `Update Analytics Export Job` step
unless the `export-analytics` Cloud Run job already exists.

1. Create the dataset:

```bash
bq --location=US mk --dataset "$PROJECT_ID:fractal_analytics"
```

2. Grant the runtime service account BigQuery permissions:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:fractal-runtime@fractal-goals.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

bq query --use_legacy_sql=false "
GRANT \`roles/bigquery.dataEditor\`
ON SCHEMA \`$PROJECT_ID\`.fractal_analytics
TO \"serviceAccount:fractal-runtime@fractal-goals.iam.gserviceaccount.com\";
"
```

3. Create the Cloud Run job once:

```bash
gcloud run jobs create export-analytics \
  --image="us-east1-docker.pkg.dev/$PROJECT_ID/fractal-repo/fractal-backend:latest" \
  --region=us-east1 \
  --set-secrets="SUPABASE_DIRECT_DATABASE_URL=SUPABASE_DIRECT_DATABASE_URL:latest" \
  --set-env-vars="FLASK_ENV=production,BIGQUERY_DATASET=fractal_analytics" \
  --command=python \
  --args=scripts/export_analytics_to_bigquery.py \
  --service-account="fractal-runtime@fractal-goals.iam.gserviceaccount.com"
```

After this one-time creation, Cloud Build keeps the job updated.

## Nightly Scheduler

Create a scheduler service account with permission to run Cloud Run jobs, then
schedule the execution endpoint:

```bash
gcloud iam service-accounts create analytics-export-scheduler

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:analytics-export-scheduler@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud scheduler jobs create http export-analytics-nightly \
  --location=us-east1 \
  --schedule="15 8 * * *" \
  --uri="https://us-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/export-analytics:run" \
  --http-method=POST \
  --oauth-service-account-email="analytics-export-scheduler@$PROJECT_ID.iam.gserviceaccount.com" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
```

## Dedupe Views

Create views for downstream analysis so a rare post-load/pre-watermark crash
does not double-count append-table batches:

```sql
CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.product_events_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS row_number
  FROM `PROJECT_ID.fractal_analytics.product_events`
)
WHERE row_number = 1;

CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.event_logs_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) AS row_number
  FROM `PROJECT_ID.fractal_analytics.event_logs`
)
WHERE row_number = 1;

CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.email_delivery_events_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS row_number
  FROM `PROJECT_ID.fractal_analytics.email_delivery_events`
)
WHERE row_number = 1;

CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.email_webhook_events_deduped` AS
SELECT * EXCEPT(row_number)
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS row_number
  FROM `PROJECT_ID.fractal_analytics.email_webhook_events`
)
WHERE row_number = 1;
```

Replace `PROJECT_ID` with the actual Google Cloud project id.

## First Run

Run the job manually after deploy to backfill existing analytics:

```bash
gcloud run jobs execute export-analytics --region=us-east1 --wait
```

The job logs one line when each table starts, each BigQuery load begins and
finishes, and the final per-table row counts. First runs can spend most of
their wall time inside BigQuery `job.result()` calls; if logs stop after
`Starting BigQuery load table=...`, check BigQuery job history for the matching
load job. The default batch size is 5,000 rows and can be changed on the Cloud
Run job with `ANALYTICS_EXPORT_BATCH_SIZE`.

If logs show the same `first_id`/`last_id` batch loading repeatedly, cancel the
job and deploy the cursor fix before retrying. Repeated appends can hit
BigQuery's per-table update quota with `Exceeded rate limits: too many table
update operations`; wait for the quota window to clear, create/use the dedupe
views above, then rerun the export.

The Admin overview usage panel shows the last export status and per-table
watermark from `app_settings.analytics_export_state`.

## Reporting views

The Admin overview's "Acquisition & engagement" card answers the headline questions from
Postgres over a bounded window (`services/growth_metrics_service.py`). For longer history
or slicing, create these views (after the dedupe views) and point Looker Studio at them.
They use the same definitions as the admin card.

```sql
-- Weekly Active Practitioners: accounts completing at least one session in an ISO week.
-- Session completion is the `session.completed` event; demo and admin accounts excluded.
CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.wap_weekly` AS
SELECT DATE_TRUNC(DATE(e.timestamp), ISOWEEK) AS week_start,
       COUNT(DISTINCT e.owner_user_id) AS practitioners
FROM `PROJECT_ID.fractal_analytics.event_logs_deduped` e
JOIN `PROJECT_ID.fractal_analytics.users` u ON u.id = e.owner_user_id
WHERE e.event_type = 'session.completed' AND u.role NOT IN ('demo', 'admin')
GROUP BY week_start;

-- Public-site visitors and funnel steps per day (visitors are counted per day).
CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.public_funnel_daily` AS
SELECT DATE(created_at) AS day,
       COUNT(DISTINCT visitor_day_hash) AS visitors,
       COUNT(DISTINCT IF(event_name = 'demo_started', visitor_day_hash, NULL)) AS demo_visitors,
       COUNT(DISTINCT IF(event_name = 'demo_tour_completed', visitor_day_hash, NULL)) AS tour_completers,
       COUNT(DISTINCT IF(event_name = 'waitlist_submitted', visitor_day_hash, NULL)) AS waitlist_submitters
FROM `PROJECT_ID.fractal_analytics.web_events`
GROUP BY day;

-- Sign-ups by acquisition source and week, with how many practised in their first 7 days.
CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.signups_by_source` AS
SELECT DATE_TRUNC(DATE(u.created_at), ISOWEEK) AS signup_week,
       COALESCE(u.acquisition_source, 'unknown') AS source,
       COUNT(DISTINCT u.id) AS signups,
       COUNT(DISTINCT IF(e.timestamp < TIMESTAMP_ADD(u.created_at, INTERVAL 7 DAY), u.id, NULL)) AS activated
FROM `PROJECT_ID.fractal_analytics.users` u
LEFT JOIN `PROJECT_ID.fractal_analytics.event_logs_deduped` e
  ON e.owner_user_id = u.id AND e.event_type = 'session.completed'
WHERE u.role NOT IN ('demo', 'admin')
GROUP BY signup_week, source;

-- Weekly retention by sign-up cohort: practising weeks since sign-up.
CREATE OR REPLACE VIEW `PROJECT_ID.fractal_analytics.retention_weekly` AS
SELECT DATE_TRUNC(DATE(u.created_at), ISOWEEK) AS cohort_week,
       DATE_DIFF(DATE_TRUNC(DATE(e.timestamp), ISOWEEK), DATE_TRUNC(DATE(u.created_at), ISOWEEK), WEEK) AS weeks_since_signup,
       COUNT(DISTINCT u.id) AS practitioners
FROM `PROJECT_ID.fractal_analytics.users` u
JOIN `PROJECT_ID.fractal_analytics.event_logs_deduped` e
  ON e.owner_user_id = u.id AND e.event_type = 'session.completed'
WHERE u.role NOT IN ('demo', 'admin')
GROUP BY cohort_week, weeks_since_signup;
```
