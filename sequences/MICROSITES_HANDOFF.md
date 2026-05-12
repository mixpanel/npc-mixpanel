# Microsites Sequence Handoff (Meeple 1.1.x)

You are an implementor bot. Build deterministic-but-resilient sequence sets for every fixpanel microsite at `~/code/fixpanel/oneoffs/` (live: <https://mixpanel.github.io/fixpanel/>). The goal: each microsite gets a personas-based sequence pack matching its narrative — like the mixtape pack we already shipped (5 personas → 6 in 1.1.x with a counter-cohort).

**Read this first, then read [`sequence-api-and-creation-guide.md`](./sequence-api-and-creation-guide.md) for the full schema reference.** This handoff is what you wish you had besides the reference: the design philosophy, the gotchas we already burned ourselves on, and the patterns that worked.

---

## The Mental Model

A sequence pack tells a **story** about a microsite. Pick the 4-7 user archetypes that, together, generate the dataset behaviors a workshop attendee should be able to discover in dashboards. Each archetype is one sequence file. Each gets a weighted slot in the orchestrator's `PERSONAS` array (see [`mixtape.js`](../mixtape.js) for the canonical pattern).

**The story is the deliverable.** A persona without a discoverable insight in Mixpanel is dead weight. Before writing a sequence, write down what funnel/breakdown/cohort would surface its behavior.

### Examples of stories that worked (from mixtape)

- **Lo-fi devotee subscribes; hip-hop curious bounces.** → `Subscription Started` broken down by `content_genre` shows lo-fi cohort converting >5x higher than hip-hop. Two opposite cohorts make the gap loud.
- **New visitor abandons at artist-preferences step.** → onboarding funnel visualization shows a 60% cliff at step 2 of 3.
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

### Pattern A: Conversion happy-path (e.g. `lofi-devotee`)

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

### Pattern B: Bouncer counter-cohort (e.g. `hiphop-curious`)

Persona that walks the SAME first half as the happy-path but exits at the friction point. Short, ~25-30 actions. The pair (happy-path + counter-cohort) is what makes a conversion gap visible in dashboards.

```json
{
	"counter-cohort": {
		"description": "Engages with Genre X content, hits paywall/friction, dismisses, browses more, bounces",
		"persona": "skimmer",
		"temperature": 8,
		"chaos-range": [8, 12],
		"circuitBreaker": { "maxFailures": 5, "resetOnSuccess": true, "mode": "skip" },
		"actions": [
			{ "action": "click", "selector": "#landingCta", "textFallback": "Start" },
			{ "action": "click", "selector": ".category-pill:nth-child(N)", "textFallback": "Genre X" },
			{ "action": "click", "selector": ".item-card:nth-child(1)" },
			{ "action": "click", "selector": ".item-card:nth-child(2)" },
			{ "action": "wait", "tier": "think" },
			{ "action": "click", "selector": "#paywallClose", "textFallback": "×" },
			{ "action": "scroll", "amount": "page" },
			{ "action": "navigate" },
			{ "action": "scroll", "direction": "down", "amount": "page" }
		]
	}
}
```

Key moves: same first-half DOM contact as happy-path (so events look identical until the divergence point), then `navigate` for organic wandering after the bounce.

### Pattern C: Deep-engagement / returning user (e.g. `power-listener`)

Already-converted user doing repeated engagement. Lots of category navigation, save/like clicks, hovers on content. ~150-300 actions. Use `persona: returnVisitor` or `methodical`.

### Pattern D: Cautious first-timer (e.g. `new-visitor`)

Slow exploration, partial form fill, abandons mid-onboarding. ~25-50 actions. Use `persona: firstTimer`. Pair with `requireActive: true` on optional CTAs that may not appear yet.

### Pattern E: Pure bouncer (e.g. `churning`)

8-12 actions max. Lands, looks at one thing, leaves. Use `persona: impulsive`. No form interactions.

---

## File Layout Per Microsite

For microsite `foo`, create:

```
sequences/
├── foo.js                       # Optional orchestrator if foo needs a dedicated endpoint (mirrors mixtape.js)
├── foo-power-user.json          # 5-7 sequence files
├── foo-converter.json
├── foo-bouncer.json
├── foo-explorer.json
├── foo-frustrated.json
├── foo-counter-cohort.json      # The mirror of foo-converter for the conversion-gap story
└── ...
```

Each JSON file is one sequence keyed by its persona name. The orchestrator (`foo.js` or just a payload to `/simulate`) assigns weights:

```js
const PERSONAS = [
	// Total must sum to 100. Make sure each weight ≥ 5% to actually move dashboards.
	{ name: 'power-user', weight: 10, sequenceFile: 'foo-power-user.json' },
	{ name: 'converter', weight: 30, sequenceFile: 'foo-converter.json' }, // happy-path
	{ name: 'counter-cohort', weight: 10, sequenceFile: 'foo-counter-cohort.json' }, // mirror
	{ name: 'explorer', weight: 22, sequenceFile: 'foo-explorer.json' },
	{ name: 'bouncer', weight: 22, sequenceFile: 'foo-bouncer.json' },
	{ name: 'frustrated', weight: 6, sequenceFile: 'foo-frustrated.json' }
];
```

Decide if `foo` needs its own server endpoint (like `/mixtape`) or whether callers just POST to `/simulate` with the sequences inline. Endpoints make sense when:

- You want personas-distribution logic on the server
- You want bug-mode injection (like mixtape's `?bug=true` Chrome 124 cohort)
- You want the microsite advertised in `GET /help`

Otherwise just publish the JSON sequences in `sequences/` and let callers compose them.

---

## Selector Strategy

### Order of preference

1. **`#id`** — rock solid, use when available
2. **`[data-testid="..."]`** or **`[data-action="..."]`** — survives CSS refactors
3. **`[role="button"]`** + scoped under an ID — semantic, stable
4. **`.class:nth-child(N)`** — fragile, **always pair with `textFallback`**
5. Avoid: deep descendant combinators, position-only selectors, anything with auto-generated CSS class hashes

### When the live site has only fragile selectors

This is the common case for fixpanel demo sites. Strategy:

1. Write the sequence using the best selector you can find
2. Add `textFallback` to every click (visible button text)
3. Test against the live site — the resilience layer will save 60-80% of misses
4. For the persistent misses, file a follow-up to add `data-testid` to the microsite HTML

Don't try to be clever with selector engineering. The text-fallback layer is doing the heavy lifting.

---

## Handlebars-style Template Variables

Sequences can reference `{{displayName}}` and `{{email}}` in `text` fields. The orchestrator (mixtape.js example) substitutes these per-meeple before sending. If you write your own orchestrator, follow the `injectUserData()` pattern in [`mixtape.js`](../mixtape.js).

```json
{ "action": "type", "selector": "#email", "text": "{{email}}" }
```

---

## Testing Each New Sequence

### Unit-level (instant)

```bash
# Validate the JSON parses + matches the schema
node -e 'console.log(JSON.stringify(require("./sequences/foo-converter.json"), null, 2))' >/dev/null && echo OK
```

The validator runs server-side on POST /simulate; bad sequences return HTTP 400 with `details` listing every issue.

### Single-meeple smoke test (1-2 min)

```bash
# Headless against the live site
curl -X POST http://localhost:8080/simulate \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg url "https://mixpanel.github.io/fixpanel/foo/" \
    --argjson seq "$(cat sequences/foo-converter.json)" \
    '{ url: $url, users: 1, headless: true, inject: true, sequences: $seq }')"
```

Check the response: `circuit_breaker_triggered` should be false; `failed_actions` should be empty or only show `skipped: true` entries; `actions` array length should be close to your sequence length.

### Visual spot-check (5 min, the one that catches everything)

```bash
# Run with headless=false. DO NOT set OPEN_DEVTOOLS=true (1.1.x: docked devtools shrinks the viewport).
curl -X POST http://localhost:8080/simulate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://mixpanel.github.io/fixpanel/foo/", "users": 1, "headless": false, "inject": true, "sequences": <your-sequence>}'
```

Watch for:

- Mouse continuity (no teleporting between actions — Phase 3 of 1.1.0 fixed this)
- Wheel-style scrolling (not smooth `scrollTo`)
- Hover dwell tracing visible text/images
- Word-burst typing (visible bursts + pauses, not uniform per-char)
- Resilience: when a selector misses, you see the text-fallback log line, NOT a crash
- Mixpanel events landing — open the project's recent events stream

### Distribution test (1 batch run)

```bash
# 20 users, all 6 personas, headless. Check the persona distribution in logs.
curl -X POST http://localhost:8080/foo \
  -d '{"users": 20, "concurrency": 10, "headless": true}' \
  | jq '.personaDistribution // .results[].persona'
```

Each persona should appear in roughly its weighted proportion. If `power-user` weight=10 and you see 0/20 power-users in 20 spawns, your weighting math is off.

---

## Gotchas We Already Hit

These are real bugs we burned time on. Don't repeat them.

1. **`chaos-range: [1, 2]` is NOT 1.0-2.0** — values divide by 10, so `[1, 2]` = multiplier 0.1-0.2 = mostly random. Use `[8, 10]` for "mostly deterministic with slight variation."
2. **Per-meeple session timeout is 10 minutes** (in `headless.js`). A sequence with 200 actions × 2-3s avg pause = ~7 min. Keep sequences under ~250 actions or you'll get truncated runs.
3. **Mixpanel Session Replay buffers 10s before flushing.** If your sequence completes in <10s, replay data may be lost. Pad with `{ "action": "wait", "tier": "read" }` if you need a recordable replay.
4. **Don't put all your weight on one persona** — engine assigns persona round-robin within a single job, so if N=10 and persona X has weight=80, you get 8 X-meeples and 0 of weights 1-2-3. Spread weights to ≥5% each.
5. **`navigate` action goes anywhere on the same domain.** It's organic but unpredictable. After a tight conversion sequence, follow with a `navigate` to add realism, but don't rely on landing on a specific page.
6. **DevTools in headless=false mode**: 1.1.x flipped this to opt-in via `OPEN_DEVTOOLS=true` env var. Default is now off so the page viewport in dev matches production.
7. **`hover` selector that doesn't exist** still triggers the resilience layer (filler+retry+skip). Better to omit the hover than reference a fragile selector — hovers don't generate funnel events, just heatmap data.
8. **Engine personas (15) are NOT the same as your microsite cohort names.** Your sequence file uses microsite-cohort names ("converter", "bouncer") for orchestration. The `persona` field inside each sequence references engine personas (`taskFocused`, `skimmer`, etc.) for pacing.

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

For each microsite, identify which patterns map to its core narrative and build accordingly.

---

## Definition of Done Per Microsite

A microsite sequence pack is "done" when:

- [ ] 4-7 sequence files exist, each with `persona`, `circuitBreaker`, and reasonable `temperature`/`chaos-range`
- [ ] Every fragile click has `textFallback`
- [ ] Pack includes at least one happy-path + one counter-cohort that share an early funnel and diverge
- [ ] Total weights sum to 100; each weight ≥ 5%
- [ ] One smoke test passes (headless, 1 meeple per persona, no crashes)
- [ ] Visual spot-check on the happy-path persona looks human (no teleports, natural typing, text-fallback engaging when selectors miss)
- [ ] Story is documented in the orchestrator (or a top-of-file comment in the JSON pack) with the **dashboard query that surfaces it**
- [ ] If the microsite needs a dedicated endpoint, it's registered in `server.js` and listed in `GET /help`

When all microsites are done, we'll have a self-service workshop catalogue: pick a microsite, run the pack, the dataset has built-in stories.
