#!/bin/bash
# Run a mixtape meeple session locally
# Usage: ./scripts/mixtape.sh [users] [headless]
#   defaults: 3 users, headless=false (watch them)

USERS=${1:-3}
HEADLESS=${2:-false}

node mixtape.js --users="$USERS" --headless="$HEADLESS"
