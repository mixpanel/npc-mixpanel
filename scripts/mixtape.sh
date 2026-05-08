#!/bin/bash
# Run a mixtape meeple session locally
# Usage: ./scripts/mixtape.sh [users] [headless]
#   defaults: 3 users, headless=false (watch them)
#
# Examples:
#   ./scripts/mixtape.sh                        # 3 meeples, visible browsers
#   ./scripts/mixtape.sh 5                      # 5 meeples, visible browsers
#   ./scripts/mixtape.sh 10 true                # 10 meeples, headless
#   node mixtape.js --users=2 --headless=true   # direct node invocation
#   node mixtape.js --users=5 --past=true       # with past-time simulation
#   node mixtape.js --users=3 --bugRate=0.5     # 50% of meeples get ?bug=true

USERS=${1:-3}
HEADLESS=${2:-false}

node mixtape.js --users="$USERS" --headless="$HEADLESS"
