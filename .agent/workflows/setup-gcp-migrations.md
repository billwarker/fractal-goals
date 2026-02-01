---
description: How to configure and run database migrations on GCP Cloud Run
---

# Setup GCP Cloud Run Migrations

This workflow sets up a Cloud Run Job to handle database migrations automatically during your Cloud Build deployment pipeline.

## 1. Create the Cloud Run Job (One-time Setup)

You need to manually create the job once so that Cloud Build has something to update. Run this command in your terminal (ensure you are authenticated with `gcloud`):

```bash
# Set your variables
export REGION="us-east1"
export PROJECT_ID=$(gcloud config get-value project)
export REPO="fractal-repo"
export SERVICE_ACCOUNT="fractal-runtime@fractal-goals.iam.gserviceaccount.com"

# Create the job placeholder
gcloud run jobs create migrate-db \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/fractal-backend:latest" \
  --region "$REGION" \
  --service-account "$SERVICE_ACCOUNT" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest" \
  --set-env-vars "FLASK_ENV=production" \
  --add-cloudsql-instances "fractal-goals:us-east1:fractal-goals-postgres" \
  --command "python" \
  --args "db_migrate.py,upgrade" \
  --max-retries 0
```

*Note: If `fractal-backend:latest` doesn't exist yet, you can use any python image temporarily or wait until after your first build.*

## 2. Verify Config in `cloudbuild.yaml`

The `cloudbuild.yaml` has been updated to include two new steps:
1.  **Update Migration Job**: Updates the `migrate-db` job with the newly built image.
2.  **Run Migrations**: Executes the job and waits for completion before deploying the service.

## 3. Deployment

Simply run your standard build trigger or command:
```bash
gcloud builds submit --config cloudbuild.yaml .
```
