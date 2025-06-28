#!/bin/bash

echo "Setting up Google Cloud Platform services..."

# Enable required APIs
echo "Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com

echo "Enabling Cloud Run API..."
gcloud services enable run.googleapis.com

echo "Enabling Container Registry API..."
gcloud services enable containerregistry.googleapis.com

echo "Enabling Artifact Registry API..."
gcloud services enable artifactregistry.googleapis.com

echo "✅ GCP setup complete!"
echo "You can now run: npm run deploy"