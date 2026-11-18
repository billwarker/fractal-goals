# Data retention job

`scripts/run_data_retention.py` is the daily enforcement point for the retention
schedule published in the Privacy Policy. Cloud Build creates or updates the
`data-retention` Cloud Run job, but the Scheduler trigger is provisioned once per
environment.

Create a scheduler service account with permission to run Cloud Run jobs, then
create a daily authenticated HTTP trigger for the job's `:run` endpoint. Use the
same project and region as `cloudbuild.yaml`. After provisioning, execute the job
manually and verify that its logs contain both `Erasures executed` and
`Retention rows pruned` before inviting beta users.

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
