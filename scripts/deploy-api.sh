#!/bin/bash

set -euo pipefail

# Deploy API service to Cloud Run (public, allow-unauthenticated)

echo "=========================================="
echo "Deploying npc-mixpanel API to Cloud Run..."
echo "=========================================="

# Check for .env file
if [ ! -f .env ]; then
  echo ".env file not found"
  exit 1
fi

# Load SERVICE_NAME
export "$(grep "^SERVICE_NAME=" .env | xargs)"
API_SERVICE_NAME="${SERVICE_NAME:-npc-mixpanel}-api"

# Deploy using Cloud Build
gcloud builds submit \
  --config cloudbuild-api.yaml \
  --substitutions _SERVICE_NAME="${API_SERVICE_NAME}" \
  --region us-central1

echo ""
echo "API deployment complete!"
echo "Service: ${API_SERVICE_NAME}"
