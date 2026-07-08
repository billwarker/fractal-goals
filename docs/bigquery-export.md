# BigQuery Analytics Export

Fractal Goals exports admin analytics tables from Postgres to BigQuery through
a Cloud Run job named `export-analytics`. Cloud Build updates the job image and
environment on each deploy, but it does not execute the job.

## Exported Data

- `product_events`: incremental append by `(created_at, id)`.
- `event_logs`: incremental append by `(timestamp, id)`.
- `email_delivery_events`: incremental append by `(created_at, id)`.
- `email_webhook_events`: incremental append by `(created_at, id)`.
- `users`: full dimension refresh with `WRITE_TRUNCATE`.

The users dimension includes only account analytics fields: `id`, `username`,
`email`, `role`, `is_active`, `membership_tier`, `created_at`, and
`last_login_at`. It intentionally excludes password hashes, preferences, quota
overrides, and other private account internals. The export job does not export
Supabase platform metadata, auth schema internals, storage metadata, Postgres
catalogs, or database storage-inspection rows.

Every BigQuery load includes an explicit schema and uses `CREATE_IF_NEEDED`, so
first-run backfills create `event_logs` and the other analytics tables even
when the dataset starts empty.

Incremental table watermarks live in `app_settings.analytics_export_state` and
are advanced only after the matching BigQuery load job succeeds. Rows newer
than ten minutes are deferred so thread-delayed event writes are not skipped.
A crash after a BigQuery load but before the watermark commit can duplicate one
batch; use the dedupe views below for downstream queries.

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

The Admin overview usage panel shows the last export status and per-table
watermark from `app_settings.analytics_export_state`.
