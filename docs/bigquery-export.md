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

`export-analytics-nightly` (Cloud Scheduler, us-east1) runs the job at **08:15 UTC**,
45 minutes after `data-retention-daily` (07:30 UTC, see [data-retention.md](data-retention.md)),
so the night's erasures reach BigQuery in the same run. It calls the Cloud Run Admin API
as `cloud-jobs-scheduler`, which holds `roles/run.invoker` on these two jobs only:

```bash
SA="cloud-jobs-scheduler@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create cloud-jobs-scheduler
gcloud run jobs add-iam-policy-binding export-analytics --region=us-east1 \
  --member="serviceAccount:$SA" --role="roles/run.invoker"

gcloud scheduler jobs create http export-analytics-nightly \
  --location=us-east1 --schedule="15 8 * * *" --time-zone="Etc/UTC" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/us-east1/jobs/export-analytics:run" \
  --http-method=POST --oauth-service-account-email="$SA" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
  --attempt-deadline=180s --max-retry-attempts=3 --min-backoff=300s --max-backoff=1800s
```

Scheduler retries only a failed *start*; the job's own `maxRetries: 3` covers a failed run.
Admin → Overview → System warns after 48 hours without a successful export.

## Dedupe and reporting views

The export job keeps the warehouse views current: after each successful run it applies
every `CREATE OR REPLACE VIEW` in [`services/analytics_views.sql`](../services/analytics_views.sql)
to the export dataset. A failed view is logged and recorded as `views_error` in
`app_settings.analytics_export_state`; it doesn't fail the run, since the data is loaded.

- **Dedupe views** (`*_deduped`): a rare post-load, pre-watermark crash can load one batch
  twice, so query these rather than the raw append tables.
- **Reporting views**: `wap_weekly`, `public_funnel_daily`, `signups_by_source` and
  `retention_weekly`, using the Admin overview's definitions
  (`services/growth_metrics_service.py`). Point Looker Studio at them for history the
  Postgres live window no longer holds.

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
