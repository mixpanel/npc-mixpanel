#!/bin/bash

set -euo pipefail

# Deploy all npc-mixpanel services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "Deploying all npc-mixpanel services..."
echo "=========================================="

echo ""
echo "Step 1: Deploying UI service (Cloud Run, private)..."
echo ""
"${SCRIPT_DIR}/deploy-run.sh"

echo ""
echo "Step 2: Deploying API service (Cloud Run, public)..."
echo ""
"${SCRIPT_DIR}/deploy-api.sh"

echo ""
echo "=========================================="
echo "All deployments complete!"
echo "=========================================="
echo ""
echo "UI (private):  https://meeple.mixpanel.org"
echo "API (public):  https://npc-mixpanel-api-lmozz6xkha-uc.a.run.app"
