# CLAUDE.md

## Project Overview

**npc-mixpanel** — cloud-based web automation service simulating realistic user behavior on websites using Puppeteer. Generates synthetic analytics data for Mixpanel by orchestrating "Meeples" (NPCs) that behave like real users.

## Commands

```bash
npm run local          # Start dev server (./scripts/local.sh)
npm run fire           # POST scripts/payload.json to localhost:8080
npm test               # Jest + Puppeteer (NODE_ENV=test)
npm run validate       # Typecheck + lint + format check
npm run typecheck      # TypeScript type checking (no emit, JS codebase)
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier (tabs, single quotes, 120-char width)
npm run format:check   # Check formatting
npm run deploy         # Deploy both UI + API services
npm run deploy:ui      # Deploy UI only (Cloud Run, private)
npm run deploy:api     # Deploy API only (Cloud Run, public)
```

## Architecture

### Core Files

- **server.js** — Express + Socket.IO server. Runtime-aware via `RUNTIME_CONTEXT` env var
- **microsites.js** — Multi-site orchestrator (runs sequential simulations across 6 microsites)
- **index.d.ts** — TypeScript definitions for all core types

### Meeple Modules (`meeple/`)

Modular automation engine. All functions accept a `log` parameter for per-meeple scoped logging.

| Module            | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `headless.js`     | Main orchestrator, entry point: `main(PARAMS, logFunction)` |
| `browser.js`      | Browser config, launch, stealth setup                       |
| `security.js`     | Anti-detection techniques                                   |
| `navigation.js`   | Page navigation, URL handling                               |
| `interactions.js` | Human-like mouse movements, clicks, scrolling               |
| `forms.js`        | Form filling and submission                                 |
| `hotzones.js`     | Interactive element detection and targeting                 |
| `entities.js`     | User entity generation                                      |
| `personas.js`     | User behavior patterns                                      |
| `sequences.js`    | Deterministic sequence execution engine                     |
| `analytics.js`    | Mixpanel tracking integration                               |
| `utils.js`        | Shared helpers                                              |
| `agents.json`     | Realistic browser fingerprints for UA spoofing              |

### Utils (`utils/`)

- **logger.js** — WebSocket + console logging with meeple ID routing
- **cloudLogger.js** — GCP Cloud Logging structured logger
- **injectMixpanel.js** — Mixpanel SDK injection with CSP workarounds and fallbacks

### Middleware (`middleware/`)

- **runtimeGuard.js** — Route access control based on `RUNTIME_CONTEXT`. Exports `createRuntimeGuard()`, `authenticateApi(req)`, `isApiContext`

### UI (`ui/`)

- **ui.html** + **app.js** + **styles.css** — Web interface with per-meeple tabbed terminal for real-time log streams

## Dual-Service Architecture

Same container deploys as two Cloud Run services, differentiated by `RUNTIME_CONTEXT`:

|               | UI Service (`npc-ui`) | API Service (`npc-api`)                                  |
| ------------- | --------------------- | -------------------------------------------------------- |
| Auth          | Private (IAP)         | Public, requires `user_id` (@mixpanel.com) + `safe_word` |
| Web UI        | Served                | Blocked                                                  |
| WebSocket     | Enabled               | Disabled                                                 |
| `/simulate`   | IAP auth              | API auth                                                 |
| `/microsites` | Blocked               | API auth                                                 |

Local testing:

```bash
RUNTIME_CONTEXT=npc-ui npm run local    # UI context (default)
RUNTIME_CONTEXT=npc-api NODE_ENV=dev node server.js  # API context
```

### Deployment Files

| File                           | Purpose                          |
| ------------------------------ | -------------------------------- |
| `cloudbuild.yaml`              | UI service (private)             |
| `cloudbuild-api.yaml`          | API service (public)             |
| `.github/workflows/deploy.yml` | CI/CD: builds once, deploys both |
| `scripts/deploy-all.sh`        | Manual deploy both               |

## Sequences API

`POST /simulate` supports deterministic sequences for reproducible user journeys. Key concepts:

- **temperature** (0-10): adherence to sequence (0=random, 10=strict)
- **chaos-range** `[min, max]`: multiplier on temperature for run-to-run variability
- **actions**: array of `{action, selector, text?, value?}` — supports `click`, `type`, `select`
- Multiple sequences distribute evenly among users

See `meeple/sequences.js` for execution logic and `server.js` for validation.

## Environment

Required in `.env`:

- `SERVICE_NAME`, `MIXPANEL_TOKEN`
- `NODE_ENV` — `dev` | `production` | `test`
- `RUNTIME_CONTEXT` — `npc-ui` | `npc-api`

## Limits

- Max 100 users/simulation, max 20 concurrent (raised from 25/10 in 1.1.0)
- 10-min timeout per session, 1-min page load timeout
- Cloud Run: 8Gi memory, 4 CPU, 3600s timeout, 0-10 instances
- Wall-clock math: 100 users ÷ 20 concurrent × 10 min/session ≈ 50 min, fits the 60-min Cloud Run timeout
- Per-job memory: 20 browsers × ~100 MB ≈ 2 GB. Multi-tenant `--concurrency` (currently 10) may need to drop to 2 if OOM observed
- Sessions targeted past 10 min (researcher / contentReader / methodical can target up to 12) get cut off at the per-session timeout

## Known Issues

(none — pre-existing typecheck errors cleared in 1.1.0)

- `meeple/sequences.js` uses `@ts-nocheck` to suppress DOM/type complexity
