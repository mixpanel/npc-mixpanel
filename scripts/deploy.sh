#!/bin/bash

set -euo pipefail

# Cleanup on exit (success or error)
cleanup() {
  echo "Cleaning up .env.yaml..."
  rm -f .env.yaml
}
trap cleanup EXIT

# Check for .env file
if [ ! -f .env ]; then
  echo ".env file not found"
  exit 1
fi

# Check required env vars
if ! grep -q "^SERVICE_NAME=" .env; then
  echo "SERVICE_NAME is not set in the .env file"
  exit 1
fi

if ! grep -q "^MIXPANEL_TOKEN=" .env; then
  echo "MIXPANEL_TOKEN is not set in the .env file"
  exit 1
fi

# Load SERVICE_NAME into environment
export $(grep "^SERVICE_NAME=" .env | xargs)

# Convert .env to flat YAML format
echo "Generating .env.yaml..."
grep -v '^#' .env | grep -v '^\s*$' | while IFS='=' read -r key value; do
  echo "$key: \"${value//\"/\\\"}\""
done > .env.yaml

# Deploy
echo "Deploying function: $SERVICE_NAME..."
gcloud alpha functions deploy "$SERVICE_NAME" \
  --gen2 \
  --allow-unauthenticated \
  --env-vars-file .env.yaml \
  --runtime nodejs20 \
  --region us-central1 \
  --trigger-http \
  --memory 8GB \
  --entry-point entry \
  --source . \
  --timeout=3600 \
  --max-instances=100 \
  --min-instances=0 \
  --concurrency=1

echo "✅ Deployment complete."
