---
name: logs
description: |
  Read production logs from GCP Cloud Logging for the npc-mixpanel Cloud Run
  services. Queries BOTH the UI service (npc-mixpanel) and API service
  (npc-mixpanel-api). Use when the user says "check logs", "show logs",
  "what happened in prod", "any errors", or asks about production behavior.
---

# Read Production Logs

Query Cloud Run logs for both npc-mixpanel services in GCP project `mixpanel-gtm-training`, region `us-central1`.

## Services

| Service | Name               | Context                              |
| ------- | ------------------ | ------------------------------------ |
| UI      | `npc-mixpanel`     | Private, IAP-protected web interface |
| API     | `npc-mixpanel-api` | Public API endpoint                  |

## Quick log read (both services)

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND (resource.labels.service_name="npc-mixpanel" OR resource.labels.service_name="npc-mixpanel-api") AND resource.labels.location="us-central1" AND severity>=DEFAULT AND log_name!~"watcher_log|cloudaudit"' \
  --project=mixpanel-gtm-training \
  --limit=50 \
  --format="json" \
  --freshness=1h
```

## UI service logs only

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="npc-mixpanel" AND resource.labels.location="us-central1" AND severity>=DEFAULT AND log_name!~"watcher_log|cloudaudit"' \
  --project=mixpanel-gtm-training \
  --limit=50 \
  --format="json" \
  --freshness=1h
```

## API service logs only

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="npc-mixpanel-api" AND resource.labels.location="us-central1" AND severity>=DEFAULT AND log_name!~"watcher_log|cloudaudit"' \
  --project=mixpanel-gtm-training \
  --limit=50 \
  --format="json" \
  --freshness=1h
```

## Errors only (both services)

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND (resource.labels.service_name="npc-mixpanel" OR resource.labels.service_name="npc-mixpanel-api") AND severity>=ERROR' \
  --project=mixpanel-gtm-training \
  --limit=20 \
  --format="json" \
  --freshness=24h
```

## Filter by specific simulation/job

Look for meeple-related log entries with context:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="npc-mixpanel-api" AND textPayload=~"meeple"' \
  --project=mixpanel-gtm-training \
  --limit=50 \
  --format="json" \
  --freshness=6h
```

## Structured logs (from cloudLogger.js)

The app uses `utils/cloudLogger.js` for structured GCP logging. These appear in `jsonPayload`:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND (resource.labels.service_name="npc-mixpanel" OR resource.labels.service_name="npc-mixpanel-api") AND jsonPayload.message!=""' \
  --project=mixpanel-gtm-training \
  --limit=30 \
  --format="json" \
  --freshness=1h
```

## Check recent deployments

```bash
gcloud run revisions list \
  --service=npc-mixpanel \
  --region=us-central1 \
  --project=mixpanel-gtm-training \
  --limit=5

gcloud run revisions list \
  --service=npc-mixpanel-api \
  --region=us-central1 \
  --project=mixpanel-gtm-training \
  --limit=5
```

## Adjusting queries

- Change `--freshness` to widen/narrow the time window (e.g., `6h`, `24h`, `7d`)
- Change `--limit` for more/fewer results
- Add `AND textPayload=~"SEARCH_TERM"` to grep for specific text
- Add `AND severity>=WARNING` to filter by severity level
- Use `--format="table(timestamp,severity,textPayload)"` for compact output

## Tips

- User says "check logs" with no qualifier → query both services, last 1h, errors first
- User mentions API or simulate → focus on `npc-mixpanel-api`
- User mentions UI or interface → focus on `npc-mixpanel`
- Always show timestamps and severity in output summaries
- If logs are empty, check `--freshness` — services may have been idle
