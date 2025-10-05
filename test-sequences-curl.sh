#!/bin/bash

# Test script for the Sequences API
# Start the server with `npm run local` before running this script

echo "🧪 Testing Sequences API with cURL"
echo "====================================="

# Test 1: Valid sequences
echo
echo "1️⃣ Testing valid sequences..."

curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -s \
  -d '{
    "url": "https://ak--47.github.io/fixpanel/",
    "users": 2,
    "concurrency": 2,
    "headless": true,
    "sequences": {
      "test-flow": {
        "description": "Simple test flow",
        "temperature": 7,
        "chaos-range": [1, 2],
        "actions": [
          {"action": "click", "selector": "body"},
          {"action": "click", "selector": "h1"}
        ]
      }
    }
  }' | jq '.results[0] | {duration, persona, sequence, success, actionCount: (.actions | length)}'

echo
echo "2️⃣ Testing invalid sequences (should return error)..."

curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -s \
  -d '{
    "url": "https://ak--47.github.io/fixpanel/",
    "users": 1,
    "sequences": {
      "invalid-flow": {
        "temperature": 15,
        "actions": [
          {"action": "invalid", "selector": "#test"}
        ]
      }
    }
  }' | jq '{error, details}'

echo
echo "3️⃣ Testing backward compatibility (no sequences)..."

curl -X POST http://localhost:3000/simulate \
  -H "Content-Type: application/json" \
  -s \
  -d '{
    "url": "https://ak--47.github.io/fixpanel/",
    "users": 1,
    "headless": true
  }' | jq '.results[0] | {duration, persona, sequence, success}'

echo
echo "✅ Sequences API tests completed!"
echo "📚 See README-sequences.md for full documentation"