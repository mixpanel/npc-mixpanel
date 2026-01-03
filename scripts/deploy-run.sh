#!/bin/bash

set -euo pipefail

# Deploy UI service to Cloud Run (private, behind IAP)

echo "=========================================="
echo "Deploying npc-mixpanel UI to Cloud Run..."
echo "=========================================="

# Check for .env file
if [ ! -f .env ]; then
  echo ".env file not found"
  exit 1
fi

# Load SERVICE_NAME
export "$(grep "^SERVICE_NAME=" .env | xargs)"
SERVICE_NAME="${SERVICE_NAME:-npc-mixpanel}"

# Deploy using Cloud Build
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions _SERVICE_NAME="${SERVICE_NAME}" \
  --region us-central1

echo ""
echo "UI deployment complete!"
echo "Service: ${SERVICE_NAME}"
