#!/bin/bash

# Load .env file
if [ -f .env ]; then
  export $(cat .env | xargs)
else
  echo ".env file not found"
  exit 1
fi

# Check if SERVICE_NAME is set
if [ -z "$SERVICE_NAME" ]; then
  echo "SERVICE_NAME is not set in the .env file"
  exit 1
fi


# http deploy
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
  --min-instances=0
