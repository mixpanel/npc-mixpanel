# Microsites Sequence Handoff (Meeple 1.1.x)

You are an implementor bot. Build deterministic-but-resilient sequence sets for the **6 fixpanel industry verticals** at `~/code/fixpanel/app/{financial,checkout,streaming,admin,wellness,lifestyle}/` (live: <https://mixpanel.github.io/fixpanel/{vertical}/>). Each vertical gets a personas-based sequence pack matching its narrative — the mixtape pack already shipped (5 personas + 1 counter-cohort) is the canonical example.

**Read this first, then read [`sequence-api-and-creation-guide.md`](./sequence-api-and-creation-guide.md) for the full schema reference.**

---

## Your Targets — The 6 Industry Verticals

These are Next.js apps under `~/code/fixpanel/app/`. **Do a deep dive into each `app/{vertical}/` directory** — read the page.tsx, the components, the routes — before writing sequences. The story hints below come from the landing page (`~/code/fixpanel/app/page.tsx`) but the source code has the ground truth.

| Vertical    | App      | Live URL                                         | Friction (the bug)                            | Feature flags (the stories)                                  |
| ----------- | -------- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| `financial` | iBank    | `https://mixpanel.github.io/fixpanel/financial/` | Lengthy KYC form on signup page               | Customer stories modal (homepage), KYC auto-fill (signup)    |
| `checkout`  | weBuy    | `https://mixpanel.github.io/fixpanel/checkout/`  | Broken coupon code field in cart              | AI Chatbot (bottom-right), Dynamic CTA, Coupon drawer (left) |
| `streaming` | meTube   | `https://mixpanel.github.io/fixpanel/streaming/` | Broken 'like' and 'subscribe' buttons         | Video recommender, AI Playlist Builder (lower right)         |
| `admin`     | youAdmin | `https://mixpanel.github.io/fixpanel/admin/`     | Broken CSV export, permission errors (25%)    | Integration chatbot helper (lower right)                     |
| `wellness`  | ourHeart | `https://mixpanel.github.io/fixpanel/wellness/`  | Form validation too strict (submit page)      | Wheel of Symptoms spinner (lower left)                       |
| `lifestyle` | theyRead | `https://mixpanel.github.io/fixpanel/lifestyle/` | Comment count mismatch (0 shown vs displayed) | Post analyzer for bias/AI detection (hero button)            |

Each vertical has a **friction** (a broken thing — drives bouncer/frustrated cohorts) and **feature flags** (story-specific surfaces — drive flag-vs-control conversion comparisons). Both should appear in the sequence pack: a happy-path that completes the conversion under the flag, a counter-cohort that hits the friction and bails.

### Where the pipeline runs

These verticals are wired into `microsites.js` and run via `POST /microsites` (cron-triggered). Per-vertical defaults:

- **10 meeples** (concurrency 5 within each vertical)
- **headless: true**
- **past: false** (real-time timestamps)
- **inject: false** — Mixpanel is already loaded by the site itself
- **3 verticals run in parallel** (controlled — keeps memory under ~1.5GB)
- **27-min hard cap** on the whole job (fits the 30-min Cloud Scheduler timeout)

---

## inject:false and Defensive Super Props

Every fixpanel vertical loads its own Mixpanel SDK with the project's real token. Don't override that — pass `inject: false` so the meeple doesn't try to inject a second SDK or relax CSP.

You DON'T need to do anything for super-prop registration. The engine attempts `window.mixpanel.register({ meeple: true, meeple_id, meeple_persona, meeple_phase, meeple_actions, ... })` defensively at session start, every 10 actions, and at session end. If the page has Mixpanel, every event the site fires gets these props attached. If it doesn't, the call silently no-ops.

This is what makes `meeple_persona` filterable in dashboards even though we never injected anything.

---

## The Mental Model

A sequence pack tells a **story** about a vertical. Pick the 4-7 user archetypes that, together, generate behaviors a workshop attendee should be able to discover in dashboards. Each archetype is one sequence file, weighted in the orchestrator's `PERSONAS` array (see [`mixtape.js`](../mixtape.js)).

**The story is the deliverable.** A persona without a discoverable insight in Mixpanel is dead weight. Before writing a sequence, write down what funnel/breakdown/cohort would surface its behavior.

### Story patterns that map well to each vertical

- **financial (iBank):** KYC happy-path (auto-fill flag ON, completes signup) vs KYC abandoner (flag OFF, hits the long form, drops at field N). Funnel: Signup Started → KYC Step 1 → KYC Step 2 → Account Created. Breakdown by `feature_flag_kyc_autofill`. Customer-stories engaged cohort vs not-engaged on the homepage modal.
- **checkout (weBuy):** Cart converter (chatbot flag ON, completes purchase) vs coupon-frustrated (tries broken coupon field, abandons cart). Funnel: Product View → Add to Cart → Coupon Attempt → Checkout. Breakdown by `feature_flag_chatbot`.
- **streaming (meTube):** Subscribed viewer (recommender flag ON, watches 5+ videos, subscribes) vs frustrated liker (clicks broken like/subscribe repeatedly, churns). Engagement metric: videos watched per session. Breakdown by `feature_flag_recommender`.
- **admin (youAdmin):** Power admin (completes CSV export workaround, manages 10+ users) vs perms-blocked admin (hits permission error, raises support flag). Cohort: 25% permission-error rate.
- **wellness (ourHeart):** Symptom-spinner user (uses wheel flag, submits successfully) vs validation-frustrated submitter (hits strict form errors, abandons). Funnel: Symptom Selection → Symptom Submit → Result View.
- **lifestyle (theyRead):** Bias-checker reader (uses post-analyzer flag, deep engagement) vs comment-confused user (sees count mismatch, bails). Engagement: posts read, comments left.

### Examples of stories that worked (mixtape pattern)

- **Lo-fi devotee subscribes; hip-hop curious bounces.** → `Subscription Started` broken down by `content_genre` shows lo-fi cohort converting >5x higher than hip-hop. Two opposite cohorts make the gap loud.
- **Power-listener converts annual; casual browses + bounces.** → LTV breakdown by persona is bimodal.

### Examples that DIDN'T work

- "User does some stuff" — no funnel, no cohort, no insight. Skip.
- A persona at 1% weight — won't move any chart. Either bump to ≥5% or cut.

---

## The 1.1.x Sequence API in One Page

Full reference is in [`sequence-api-and-creation-guide.md`](./sequence-api-and-creation-guide.md). Here's the cheat sheet for what's NEW in 1.1.x and what you should default to.

### Action types (8 total; 4 are new in 1.1.x)

| Action         | Selectorless?          | Use for                                                                                                           |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `click`        | no                     | The bread-and-butter. Always add `textFallback` if the selector is positional.                                    |
| `type`         | no                     | Form fills. Persona controls typing speed (word-burst with delayed typo detection).                               |
| `select`       | no                     | `<select>` dropdowns.                                                                                             |
| `fillOutForm`  | no                     | Multi-element forms (radios/checkboxes/inputs in one shot).                                                       |
| **`navigate`** | **yes**                | Same-domain link wandering. Use after a deterministic flow ends to add organic exploration.                       |
| **`scroll`**   | **either**             | With selector → scroll element into view. Without → page scroll (`direction`: up/down, `amount`: page/half/N px). |
| **`hover`**    | no (selector required) | Reading-trace dwell over text/images. Use for heatmap richness on key CTAs.                                       |
| **`wait`**     | yes                    | Explicit pause. `tier: micro\|read\|think` (recommended) OR `ms: 50-30000`.                                       |

### Required new field: `textFallback` on every fragile click

If a selector uses `:nth-child`, `>`, deep descendants, or anything position-dependent, **you MUST add `textFallback`**. Example:

```json
{ "action": "click", "selector": ".genre-pill:nth-child(4)", "textFallback": "Hip-Hop" }
```

When the selector misses, the engine searches visible button/link/card text for "Hip-Hop" (case-insensitive substring) and clicks the match. This is the difference between a sequence that survives a CSS refactor and one that doesn't.

The engine also auto-infers fallback text from quoted strings inside the selector (e.g. `[data-genre="lofi"]` infers "lofi"), so for attribute selectors you can often skip `textFallback`.

### Sequence-level `persona` field — pick one per file

Stamps the sequence with a 1.1.x persona for typing speed, dwell duration, and pacing. The 15 personas are exposed at `GET /api/personas` (also enumerated in `meeple/entities.js`). Quick map:

| If the cohort is...                        | Use persona                     |
| ------------------------------------------ | ------------------------------- |
| Goal-oriented power user (conversion path) | `taskFocused` or `speedRunner`  |
| Long-dwell reader, deep engagement         | `contentReader` or `researcher` |
| Light browsing, no commit                  | `browser` or `skimmer`          |
| First-time visitor, cautious               | `firstTimer`                    |
| Mobile-tap pattern                         | `mobileUser`                    |
| Bouncer / quick exit                       | `impulsive` or `skimmer`        |
| Frustrated, rage-clicks                    | `frustrated`                    |
| Form-heavy task                            | `formFiller` or `methodical`    |
| Returning user, knows the site             | `returnVisitor`                 |

The persona changes pacing under the hood — you don't write timing into the sequence beyond `wait` actions.

### Resilience: free, automatic, you don't have to ask for it

When a click selector fails (after the standard 5s wait), the engine runs:

1. **text-match fallback** (uses `textFallback` + inferred quoted strings)
2. **filler action** (random scroll or natural mouse) — keeps replay producing events
3. **1-3s pause** for slow renders
4. **retry** with extended 10s timeout
5. **drop step** as `{ skipped: true }` if still missing — does NOT trip the circuit breaker

**Practical implication:** you can write sequences against a slightly stale DOM and they'll mostly survive. But you should still test against the live site.

### Circuit breaker — defaults are fine

Keep `{ "maxFailures": 5, "resetOnSuccess": true, "mode": "skip" }` for every sequence. Use `mode: "terminate"` only for tight demos where partial completion is misleading.

### Temperature + chaos — defaults are fine

`temperature: 8` + `chaos-range: [8, 12]` for production-realistic sequences. `temperature: 10` + `chaos-range: [10, 10]` only for strict demos. **Note the chaos-range gotcha: values are divided by 10.** `[1, 2]` means multiplier 0.1-0.2 (way more random than you'd expect).

---

## Templates That Worked

### Pattern A: Conversion happy-path (e.g. `lofi-devotee`, `iBank-kyc-converter`)

Persona that completes the full funnel and converts. Long, dense, mostly clicks. ~150-200 actions.

```json
{
	"happy-path": {
		"description": "Full funnel — lands, engages, signs up, subscribes, deep usage",
		"persona": "taskFocused",
		"temperature": 8,
		"chaos-range": [8, 12],
		"circuitBreaker": { "maxFailures": 5, "resetOnSuccess": true, "mode": "skip" },
		"actions": [
			{ "action": "click", "selector": "#landingCta", "textFallback": "Get Started" },
			{ "action": "scroll", "amount": "half" },
			{ "action": "hover", "selector": "#primaryCta" },
			{ "action": "click", "selector": "#primaryCta", "textFallback": "Sign Up" },
			{ "action": "type", "selector": "#email", "text": "{{email}}" },
			{ "action": "wait", "tier": "think" },
			{ "action": "click", "selector": "#submit" }
			// ... rest of funnel
		]
	}
}
```

Key moves: `scroll` early to bring CTA into view, `hover` on the conversion-deciding CTA (rich heatmap), `wait tier:think` before form submit (decision moment).

### Pattern B: Bouncer counter-cohort (e.g. `hiphop-curious`, `weBuy-coupon-frustrated`)

Persona that walks the SAME first half as the happy-path but exits at the friction point. Short, ~25-30 actions. The pair (happy-path + counter-cohort) is what makes a conversion gap visible in dashboards.

```json
{
	"counter-cohort": {
		"description": "Engages with X, hits friction, dismisses, browses more, bounces",
		"persona": "skimmer",
		"temperature": 8,
		"chaos-range": [8, 12],
		"circuitBreaker": { "maxFailures": 5, "resetOnSuccess": true, "mode": "skip" },
		"actions": [
			{ "action": "click", "selector": "#landingCta", "textFallback": "Start" },
			{ "action": "click", "selector": ".item-card:nth-child(1)" },
			{ "action": "click", "selector": ".item-card:nth-child(2)" },
			{ "action": "wait", "tier": "think" },
			{ "action": "click", "selector": "#frictionClose", "textFallback": "×" },
			{ "action": "scroll", "amount": "page" },
			{ "action": "navigate" },
			{ "action": "scroll", "direction": "down", "amount": "page" }
		]
	}
}
```

Key moves: same first-half DOM contact as happy-path (so events look identical until the divergence point), then `navigate` for organic wandering after the bounce.

### Pattern C: Deep-engagement / returning user (e.g. `power-listener`, `iBank-power-customer`)

Already-converted user doing repeated engagement. Lots of category navigation, save/like clicks, hovers on content. ~150-300 actions. Use `persona: returnVisitor` or `methodical`.

### Pattern D: Cautious first-timer (e.g. `new-visitor`, `weBuy-window-shopper`)

Slow exploration, partial form fill, abandons mid-onboarding. ~25-50 actions. Use `persona: firstTimer`. Pair with `requireActive: true` on optional CTAs that may not appear yet.

### Pattern E: Pure bouncer (e.g. `churning`, `meTube-frustrated-liker`)

8-12 actions max. Lands, looks at one thing, leaves. Use `persona: impulsive`. No form interactions.

---

## File Layout Per Vertical

For vertical `foo` (one of financial/checkout/streaming/admin/wellness/lifestyle):

```
sequences/
├── foo-converter.json       # Pattern A — happy-path with the feature flag working
├── foo-counter-cohort.json  # Pattern B — same start, hits friction, bails
├── foo-power-user.json      # Pattern C — deep engagement, repeat user
├── foo-first-timer.json     # Pattern D — cautious newbie
├── foo-bouncer.json         # Pattern E — quick bounce
└── foo-frustrated.json      # rage-click cohort that hits the friction hard
```

Then register the files in `microsites.js` under the matching MICROSITES entry's `sequenceFiles` array. Example for `financial`:

```js
{
    name: 'iBank',
    vertical: 'financial',
    url: 'https://mixpanel.github.io/fixpanel/financial/',
    sequenceFiles: [
        'financial-sequence-kyc-converter.json',
        'financial-sequence-kyc-frustrated.json',
        'financial-sequence-customer-stories-engaged.json',
        // ...
    ]
},
```

The microsites pipeline distributes the 10 meeples evenly across whatever sequenceFiles you list (round-robin via `sequenceNames[i % sequenceNames.length]` in `headless.js`). It does NOT do weighted distribution — for that, build a vertical-specific orchestrator alongside `mixtape.js` (only worth it if the vertical needs persona weighting OR a dedicated `/foo` endpoint).

### When to build a dedicated `foo.js` orchestrator

Build one only when:

- You need weighted persona distribution (not even split)
- You want bug-mode injection (like mixtape's `?bug=true` cohort)
- You want the vertical advertised in `GET /help` as its own endpoint

Otherwise the microsites pipeline is enough — just list the sequence files and ship.

---

## Selector Strategy

### Order of preference

1. **`#id`** — rock solid, use when available
2. **`[data-testid="..."]`** or **`[data-action="..."]`** — survives CSS refactors
3. **`[role="button"]`** + scoped under an ID — semantic, stable
4. **`.class:nth-child(N)`** — fragile, **always pair with `textFallback`**
5. Avoid: deep descendant combinators, position-only selectors, anything with auto-generated CSS class hashes

### Reading the React source for stable selectors

These verticals are Next.js. Open `~/code/fixpanel/app/{vertical}/page.tsx` and the component files in `~/code/fixpanel/components/` to find:

- explicit `id="..."` attributes (use these first)
- `data-testid="..."` (project sometimes uses these)
- semantic role selectors (`<Button>` from shadcn → `[role="button"]`)
- distinctive class names not auto-generated (Tailwind utility classes are stable enough; `_a8d7f` hashes are not)

If you find ZERO good selectors in a vertical, file a follow-up to add `data-testid` to the source. Don't try to be clever with selector engineering.

---

## Handlebars-style Template Variables

Sequences can reference `{{displayName}}` and `{{email}}` in `text` fields. The orchestrator (mixtape.js example) substitutes these per-meeple before sending. The microsites pipeline does NOT currently do template substitution — if you need per-meeple identity, build a vertical-specific orchestrator with an `injectUserData()` step like mixtape.js.

```json
{ "action": "type", "selector": "#email", "text": "{{email}}" }
```

---

## Testing Each New Sequence

### Unit-level (instant)

```bash
node -e 'console.log(JSON.stringify(require("./sequences/financial-sequence-kyc-converter.json"), null, 2))' >/dev/null && echo OK
```

### Single-meeple smoke test (1-2 min)

```bash
# Headless against the live vertical
curl -X POST http://localhost:8080/simulate \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg url "https://mixpanel.github.io/fixpanel/financial/" \
    --argjson seq "$(cat sequences/financial-sequence-kyc-converter.json)" \
    '{ url: $url, users: 1, headless: true, inject: false, sequences: $seq }')"
```

Note `inject: false` — these sites have their own Mixpanel.

Check the response: `circuit_breaker_triggered` should be false; `failed_actions` should be empty or only show `skipped: true` entries.

### Visual spot-check (5 min, the one that catches everything)

```bash
curl -X POST http://localhost:8080/simulate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mixpanel.github.io/fixpanel/financial/", "users": 1, "headless": false, "inject": false, "sequences": <your-sequence>}'
```

Watch for:

- Mouse continuity (no teleporting between actions)
- Wheel-style scrolling (not smooth `scrollTo`)
- Hover dwell tracing visible text/images
- Word-burst typing (visible bursts + pauses, not uniform per-char)
- Resilience: when a selector misses, you see the text-fallback log line, NOT a crash
- Mixpanel events landing — open the project's recent events stream and look for `meeple: true`

### Full microsite pipeline run (~12 min for all 6 verticals)

```bash
# Local — fires all 6 verticals at 3-parallel
node microsites.js --users=10

# Or single vertical
node microsites.js --vertical=financial --users=10
```

### Distribution check

For weighted orchestrators, check the persona distribution:

```bash
curl -X POST http://localhost:8080/microsites \
  -d '{"users": 10}' | jq '.microsites[] | {vertical, success, duration}'
```

---

## Gotchas We Already Hit

These are real bugs we burned time on. Don't repeat them.

1. **`chaos-range: [1, 2]` is NOT 1.0-2.0** — values divide by 10, so `[1, 2]` = multiplier 0.1-0.2 = mostly random. Use `[8, 10]` for "mostly deterministic with slight variation."
2. **Per-meeple session timeout is 10 minutes** (in `headless.js`). A sequence with 200 actions × 2-3s avg pause = ~7 min. Keep sequences under ~250 actions or you'll get truncated runs. Microsites cap meeple duration at 4min.
3. **Mixpanel Session Replay buffers 10s before flushing.** If your sequence completes in <10s, replay data may be lost. Pad with `{ "action": "wait", "tier": "read" }` if you need a recordable replay.
4. **Don't put all your weight on one persona** — engine assigns persona round-robin within a single job, so if N=10 and persona X has weight=80, you get 8 X-meeples and 0 of weights 1-2-3. Spread weights to ≥5% each.
5. **`navigate` action goes anywhere on the same domain.** It's organic but unpredictable. After a tight conversion sequence, follow with a `navigate` to add realism, but don't rely on landing on a specific page.
6. **DevTools in headless=false mode**: 1.1.x flipped this to opt-in via `OPEN_DEVTOOLS=true` env var. Default is off so the page viewport in dev matches production.
7. **`hover` selector that doesn't exist** still triggers the resilience layer (filler+retry+skip). Better to omit the hover than reference a fragile selector — hovers don't generate funnel events, just heatmap data.
8. **Engine personas (15) are NOT the same as your microsite cohort names.** Your sequence file uses microsite-cohort names ("converter", "bouncer") for orchestration. The `persona` field inside each sequence references engine personas (`taskFocused`, `skimmer`, etc.) for pacing.
9. **inject:false + the site's own Mixpanel** — meeple super-props get attached defensively via `window.mixpanel.register`. You don't have to do anything; just don't be surprised when you see `meeple_persona`, `meeple_phase`, etc. on the site's own events.
10. **The 6 verticals run in parallel** (3 at a time by default). If you write a sequence that depends on global rate-limited resources, two simultaneous runs can interfere. Stick to per-meeple state.

---

## Reference: Mixtape Pack as the Canonical Example

Already shipped, look at all of these to internalize the patterns:

- [`mixtape.js`](../mixtape.js) — orchestrator (PERSONAS, weight assignment, bug-rate injection, `injectUserData` for {{email}}/{{displayName}})
- [`sequences/mixtape-lofi-devotee.json`](./mixtape-lofi-devotee.json) — Pattern A (conversion happy-path), persona: `contentReader`
- [`sequences/mixtape-hiphop-curious.json`](./mixtape-hiphop-curious.json) — Pattern B (counter-cohort), persona: `skimmer`
- [`sequences/mixtape-power-listener.json`](./mixtape-power-listener.json) — Pattern C (deep engagement), persona: `taskFocused`, ~190 actions
- [`sequences/mixtape-new-visitor.json`](./mixtape-new-visitor.json) — Pattern D (first-timer + abandon), persona: `firstTimer`
- [`sequences/mixtape-churning.json`](./mixtape-churning.json) — Pattern E (pure bouncer), persona: `impulsive`, 9 actions
- [`sequences/mixtape-casual-browser.json`](./mixtape-casual-browser.json) — middle-ground browser, persona: `browser`

For each vertical, identify which patterns map to its core narrative and build accordingly.

---

## Definition of Done Per Vertical

A vertical sequence pack is "done" when:

- [ ] 4-7 sequence files exist in `sequences/`, each named `{vertical}-sequence-{cohort}.json`
- [ ] Each sequence has `persona`, `circuitBreaker`, and reasonable `temperature`/`chaos-range`
- [ ] Every fragile click has `textFallback`
- [ ] Pack includes at least one happy-path + one counter-cohort that share an early funnel and diverge at the friction point or feature flag boundary
- [ ] All sequence files are listed in the vertical's `sequenceFiles` array in `microsites.js`
- [ ] Smoke test passes: `curl -X POST /simulate -d '{... users:1, headless:true, inject:false, sequences:<the pack>}'`
- [ ] Visual spot-check on the happy-path persona looks human (no teleports, natural typing, text-fallback engaging when selectors miss)
- [ ] Story is documented in a top-of-file comment in each JSON pack with the **dashboard query that surfaces it**

When all 6 verticals are done, the microsites pipeline produces a self-service workshop dataset — every cron run, the project gets fresh meeple events across 6 industry contexts, each with its own friction story and feature-flag conversion gap.
