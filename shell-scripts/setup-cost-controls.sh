#!/usr/bin/env bash
#
# One-time cost controls for a low-traffic deployment.
#
# This app is designed to cost roughly the price of a Supabase Pro plan and
# little else. The items below are the ones that silently accumulate charges
# if left alone: container images that are never garbage collected, and the
# absence of a spending alarm.
#
# Safe to re-run; every command is idempotent.
#
# Usage: ./shell-scripts/setup-cost-controls.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-fractal-goals}"
REGION="${REGION:-us-east1}"
REPOSITORY="${REPOSITORY:-fractal-repo}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-50}"

echo "==> Project: $PROJECT_ID  Region: $REGION"

# ---------------------------------------------------------------------------
# 1. Artifact Registry cleanup
# ---------------------------------------------------------------------------
# Every deploy pushes two images and nothing ever deletes them. This is the
# most common source of a slowly climbing bill on an app with no users.
# Keep the 5 most recent versions per image; delete untagged after 7 days.
echo "==> Applying Artifact Registry cleanup policy"
POLICY_FILE="$(mktemp)"
cat > "$POLICY_FILE" <<'JSON'
[
  {
    "name": "delete-untagged",
    "action": {"type": "Delete"},
    "condition": {
      "tagState": "untagged",
      "olderThan": "7d"
    }
  },
  {
    "name": "keep-recent-releases",
    "action": {"type": "Keep"},
    "mostRecentVersions": {"keepCount": 5}
  }
]
JSON

gcloud artifacts repositories set-cleanup-policies "$REPOSITORY" \
  --project="$PROJECT_ID" \
  --location="$REGION" \
  --policy="$POLICY_FILE" \
  --no-dry-run
rm -f "$POLICY_FILE"

# ---------------------------------------------------------------------------
# 2. Confirm Cloud Run scales to zero
# ---------------------------------------------------------------------------
# min-instances must stay unset/0. A single always-warm instance costs more
# per month than everything else in this deployment combined.
echo "==> Verifying scale-to-zero"
for SERVICE in fractal-backend fractal-frontend; do
  MIN=$(gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" --region="$REGION" \
    --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/minScale"])' 2>/dev/null || echo "")
  if [[ -z "$MIN" || "$MIN" == "0" ]]; then
    echo "    OK   $SERVICE scales to zero"
  else
    echo "    WARN $SERVICE has min-instances=$MIN (this bills 24/7)"
  fi
done

# ---------------------------------------------------------------------------
# 3. Budget alert
# ---------------------------------------------------------------------------
# The real protection is not a cap (GCP has none) but finding out early.
echo "==> Checking budget alerts"
BILLING_ACCOUNT=$(gcloud billing projects describe "$PROJECT_ID" \
  --format='value(billingAccountName)' 2>/dev/null | sed 's|billingAccounts/||' || echo "")

if [[ -z "$BILLING_ACCOUNT" ]]; then
  echo "    SKIP could not resolve billing account; create a budget manually at:"
  echo "         https://console.cloud.google.com/billing/budgets"
elif gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" \
      --filter="displayName:fractal-goals-budget" --format='value(name)' 2>/dev/null | grep -q .; then
  echo "    OK   budget already exists"
else
  gcloud billing budgets create \
    --billing-account="$BILLING_ACCOUNT" \
    --display-name="fractal-goals-budget" \
    --budget-amount="${BUDGET_AMOUNT}USD" \
    --threshold-rule=percent=50 \
    --threshold-rule=percent=90 \
    --threshold-rule=percent=100 \
    --filter-projects="projects/$PROJECT_ID" \
    && echo "    OK   created \$${BUDGET_AMOUNT}/mo budget with 50/90/100% alerts"
fi

echo ""
echo "Done. Remaining manual items:"
echo "  - Supabase must be on Pro (\$25/mo). The Free tier PAUSES the database"
echo "    after 7 days of inactivity, which will break the app for real users."
echo "  - Leave the export-analytics job unscheduled until you have enough"
echo "    users for aggregate analysis to be worth anything."
echo "  - Schedule the data-retention job daily (it bounds stored data growth):"
echo "      gcloud scheduler jobs create http data-retention-daily \\"
echo "        --project=$PROJECT_ID --location=$REGION --schedule='0 4 * * *' \\"
echo "        --uri='https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/data-retention:run' \\"
echo "        --http-method=POST --oauth-service-account-email=fractal-runtime@$PROJECT_ID.iam.gserviceaccount.com"
