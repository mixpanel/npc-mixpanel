#!/bin/bash
cd scripts
curl -X POST localhost:8080 -H "Content-Type: application/json" -d @payload.json