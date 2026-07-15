# Landing snapshot infrastructure

The production bucket name is derived from the Cloud Build project:
`$PROJECT_ID-landing-public-$PROJECT_NUMBER`. Production therefore resolves to
`fractal-goals-landing-public-195572181270`; another project cannot accidentally
publish into it.

The runtime service account needs `roles/storage.objectAdmin` on this dedicated
bucket because replacing an object requires both create and delete permissions.
Anonymous users receive the project custom role `landingSnapshotReader`, which
contains only `storage.objects.get`; do not grant `roles/storage.objectViewer`,
because that also exposes bucket listing.

Object Versioning is enabled for rollback. Lifecycle management retains no more
than ten newer generations and removes noncurrent generations after 30 days.
To inspect and restore a generation:

```bash
gcloud storage ls --all-versions gs://fractal-goals-landing-public-195572181270/landing-examples.json
gcloud storage cp 'gs://fractal-goals-landing-public-195572181270/landing-examples.json#GENERATION' \
  gs://fractal-goals-landing-public-195572181270/landing-examples.json
```

After deployment and every first publication in a new environment, run:

```bash
./shell-scripts/verify-landing-snapshot.sh
```

The backend emits `landing.publish_delivered` and `landing.publish_failed`
structured events. The `landing_publish_failures` log metric and enabled
`Landing snapshot publication failed` alert policy are provisioned in production.
No Monitoring notification channel is attached yet; adding an email, Slack, or
PagerDuty destination requires an explicitly approved operator destination.

The billing account already has a CAD 10 monthly budget with 50%, 90%, 100%, and
150% thresholds. It currently covers the full billing account rather than only
this project. Run the verification script after each deployment/first publish;
a scheduled external synthetic check remains an optional follow-up because it
requires an operator-owned runner and notification destination.
