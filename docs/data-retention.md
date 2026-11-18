# Data retention job

`scripts/run_data_retention.py` is the daily enforcement point for the retention
schedule published in the Privacy Policy. Cloud Build creates or updates the
`data-retention` Cloud Run job, but the Scheduler trigger is provisioned once per
environment.

`data-retention-daily` (Cloud Scheduler, us-east1) runs it at **07:30 UTC**, before the
08:15 analytics export, using the same `cloud-jobs-scheduler` service account
([bigquery-export.md](bigquery-export.md#nightly-scheduler)):

```bash
gcloud run jobs add-iam-policy-binding data-retention --region=us-east1 \
  --member="serviceAccount:cloud-jobs-scheduler@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/run.invoker"

gcloud scheduler jobs create http data-retention-daily \
  --location=us-east1 --schedule="30 7 * * *" --time-zone="Etc/UTC" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/us-east1/jobs/data-retention:run" \
  --http-method=POST --oauth-service-account-email="cloud-jobs-scheduler@$PROJECT_ID.iam.gserviceaccount.com" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
  --attempt-deadline=180s --max-retry-attempts=3 --min-backoff=300s --max-backoff=1800s
```

After provisioning, execute the job once by hand and check that its logs contain both
`Erasures executed` and `Retention rows pruned`.

The job enforces:

- account erasure after the 30-day grace period;
- product-event deletion after 180 days;
- public-site (`web_events`) deletion after 90 days;

(These two are the published ceilings. While the nightly BigQuery export runs, it keeps
far less in Postgres: it flushes exported events older than the 35-day live window. See
[BigQuery export](bigquery-export.md#exported-data).)

The job also enforces:

- password-reset record deletion after 30 days;
- delivery, webhook, and administrative-audit deletion after 730 days;
- invited or dismissed beta-request deletion after 365 days.

Each run is recorded in `app_settings.data_retention_state` (`last_run_at`,
`last_success_at`, counts). Admin → Overview → System warns when this job, or the
analytics export, has no success in 48 hours, which is how a missing Scheduler
trigger shows itself.

Any failed phase makes the job exit non-zero. Configure Scheduler failure
notifications or a log-based alert so missed enforcement is visible.
