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
- password-reset record deletion after 30 days;
- delivery, webhook, and administrative-audit deletion after 730 days;
- invited or dismissed beta-request deletion after 365 days.

Any failed phase makes the job exit non-zero. Configure Scheduler failure
notifications or a log-based alert so missed enforcement is visible.
