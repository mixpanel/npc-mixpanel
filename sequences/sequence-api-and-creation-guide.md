# Sequence API & Creation Guide

Build deterministic meeple funnels from real user recordings. This guide walks you through the full pipeline: record clicks with mpTweaks, convert autocapture events to sequence JSON, tune conversion rates, and send jobs to the meeple API.

## Table of Contents

1. [The Pipeline](#the-pipeline)
2. [Record User Clicks](#step-1-record-user-clicks)
3. [Build the Sequence JSON](#step-2-build-the-sequence-json)
4. [Tune the Funnel](#step-3-tune-the-funnel)
5. [Control Conversion Rate & Drop-off](#step-4-control-conversion-rate--drop-off)
6. [Add Explorer Meeples](#step-5-add-explorer-meeples)
7. [Send the Job](#step-6-send-the-job)
8. [Reference](#reference)

---

## The Pipeline

```
mpTweaks injection        Mixpanel export          script               meeple API
     |                         |                     |                     |
  Record a user            Export the             Convert to           POST /simulate
  clicking through      autocapture events      sequence JSON        with sequences
  the funnel            (JQL / raw export)                             param
```

You walk through the site once. Meeples replay it hundreds of times with realistic variation.

---

## Step 1: Record User Clicks

Use mpTweaks to inject Mixpanel + autocapture + session replay into the target site tab. Then walk through the funnel you want meeples to replicate.

### What to capture

The raw export gives you newline-delimited JSON. Each line is one event. You only care about `$mp_click` events -- skip everything else.

**Events to keep:**

| Event Name  | Use                                                      |
| ----------- | -------------------------------------------------------- |
| `$mp_click` | User clicked something -- this becomes a sequence action |

**Events to skip:**

| Event Name           | Why                                                              |
| -------------------- | ---------------------------------------------------------------- |
| `$mp_web_page_view`  | Navigation tracking, not a user action                           |
| `$mp_page_leave`     | Page visibility change, not actionable                           |
| `$mp_rage_click`     | Duplicate of a `$mp_click` (fired when 3+ rapid clicks detected) |
| `$mp_session_record` | Session replay metadata, not a user action                       |

### Key properties in `$mp_click` events

There are no CSS selectors in the raw data -- you construct them from the element hierarchy:

| Property                     | Location                            | What it gives you                                |
| ---------------------------- | ----------------------------------- | ------------------------------------------------ |
| `$elements[0].$id`           | first element (the one clicked)     | Best selector: `#theId`                          |
| `$elements[0].$classes`      | first element                       | Fallback: `.class1.class2`                       |
| `$elements[0].$tag_name`     | first element                       | Last resort: `input`, `button`                   |
| `$elements[N].$id`           | ancestor elements (index 1, 2, ...) | Context for scoped selectors: `#parent .child`   |
| `$elements[N].$attr-role`    | any element                         | Useful: `[role="button"]`, `[role="radiogroup"]` |
| `$elements[N].$attr-href`    | any element                         | Link targets for navigation actions              |
| `$el_tag_name`               | top-level shortcut                  | Quick check: what type of element was clicked    |
| `$el_classes`                | top-level shortcut                  | Classes of the clicked element                   |
| `$current_url` / `$pathname` | top-level                           | Which page the click happened on                 |
| `time`                       | `properties.time`                   | Unix timestamp for ordering events               |

The `$elements` array is ordered **innermost to outermost** -- index 0 is the clicked element, the last index is `<body>`.

### Export the events

Pull your autocapture events from Mixpanel using any of these:

- **Raw Export API** - `GET /api/2.0/export` with date range and event filter for `$mp_click`
- **Insights export** - Create a report filtering `$mp_click` events to your `$device_id` and time window, export as JSON

The key is to get an ordered list of click events from your single walkthrough session, sorted by `time`.

---

## Step 2: Build the Sequence JSON

### Sequence schema

```json
{
	"my-funnel": {
		"description": "Human-readable description of this funnel",
		"temperature": 8,
		"chaos-range": [1, 2],
		"debug": false,
		"circuitBreaker": {
			"maxFailures": 5,
			"resetOnSuccess": true,
			"mode": "skip"
		},
		"actions": [
			{ "action": "click", "selector": "#addToCart" },
			{ "action": "type", "selector": "#email", "text": "user@example.com" },
			{ "action": "select", "selector": "#shipping", "value": "express" },
			{
				"action": "fillOutForm",
				"selector": "[role=radiogroup]",
				"clicksPerGroup": 2
			},
			{
				"action": "click",
				"selector": "#submit",
				"requireActive": true,
				"expectsNavigation": true,
				"navigationTimeout": 10000
			}
		]
	}
}
```

### Supported action types

| Action        | Required Fields     | Optional                                                  | What it does                                                                         |
| ------------- | ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `click`       | `selector`          | `requireActive`, `expectsNavigation`, `navigationTimeout` | Click an element. Adds natural mouse movement + position fuzz.                       |
| `type`        | `selector`, `text`  |                                                           | Clear field, then type with human-like delays (50-150ms/char).                       |
| `select`      | `selector`, `value` |                                                           | Select a dropdown option by its `value` attribute.                                   |
| `fillOutForm` | `selector`          | `clicksPerGroup`                                          | Find all matching elements and fill them (radios, checkboxes, selects, text inputs). |

### Action flags reference

| Flag                | Type    | Default | Description                                                             |
| ------------------- | ------- | ------- | ----------------------------------------------------------------------- |
| `requireActive`     | boolean | false   | Skip action if element is disabled/inactive. Does NOT count as failure. |
| `expectsNavigation` | boolean | false   | Wait for page navigation to complete after this action.                 |
| `navigationTimeout` | number  | 5000    | Max time (ms) to wait for navigation when `expectsNavigation: true`.    |

### Conversion script

This script reads a raw export file (newline-delimited JSON), filters to `$mp_click` events, constructs CSS selectors from the element hierarchy, deduplicates rage clicks, and outputs sequence JSON.

```javascript
// convert-autocapture-to-sequence.js
// Usage: node convert-autocapture-to-sequence.js <exported-events.json> > my-sequence.json

import { readFileSync } from 'fs';

const raw = readFileSync(process.argv[2], 'utf-8').trim();

// Raw export is newline-delimited JSON (one object per line)
const events = raw.split('\n').map(line => JSON.parse(line));

// Keep only $mp_click, skip page views, page leaves, rage clicks, session records
const clicks = events.filter(e => e.event === '$mp_click').sort((a, b) => a.properties.time - b.properties.time);

/**
 * Build the best CSS selector from the $elements hierarchy.
 * Strategy:
 *   1. If the clicked element (index 0) has an $id, use it: #theId
 *   2. Otherwise, walk up ancestors to find the nearest $id, then
 *      scope the target under it: #ancestorId .target-class or #ancestorId tag
 *   3. If an element has $attr-role, consider [role="value"] selectors
 *   4. Last resort: .class1.class2 or just the tag name
 */
function buildSelector(elements) {
	if (!elements || elements.length === 0) return null;

	const target = elements[0];

	// 1. Target has an ID -- best case
	if (target.$id) {
		return `#${target.$id}`;
	}

	// 2. Target has a role attribute -- often more stable than classes
	const targetRole = target['$attr-role'];
	if (targetRole) {
		// Walk up to find a scoping ancestor with an ID
		for (let i = 1; i < elements.length; i++) {
			if (elements[i].$id) {
				return `#${elements[i].$id} [role="${targetRole}"]`;
			}
		}
		return `[role="${targetRole}"]`;
	}

	// 3. Target has classes -- scope under nearest ancestor with ID
	const targetClasses = (target.$classes || []).filter(c => c && c.trim());
	const targetClassStr = targetClasses.map(c => `.${c}`).join('');

	for (let i = 1; i < elements.length; i++) {
		if (elements[i].$id) {
			if (targetClassStr) {
				return `#${elements[i].$id} ${targetClassStr}`;
			}
			return `#${elements[i].$id} ${target.$tag_name}`;
		}
	}

	// 4. No ancestor ID found -- use classes or tag name
	if (targetClassStr) {
		return targetClassStr;
	}
	return target.$tag_name || null;
}

// Convert clicks to sequence actions, deduplicating consecutive identical selectors
const actions = [];
let lastSelector = null;

for (const event of clicks) {
	const props = event.properties;
	const elements = props.$elements || [];
	const selector = buildSelector(elements);

	if (!selector) continue;

	// Skip consecutive duplicate selectors (rage click noise)
	if (selector === lastSelector) continue;
	lastSelector = selector;

	actions.push({ action: 'click', selector });
}

const sequence = {
	'my-funnel': {
		description: 'Converted from autocapture recording',
		temperature: 9,
		'chaos-range': [9, 10],
		actions
	}
};

console.log(JSON.stringify(sequence, null, 2));
```

After running the script, **review and clean up the output**. You'll often want to:

- Simplify overly complex selectors
- Remove unintentional clicks (accidental taps, carousel navigation you don't care about)
- Add `type` or `select` actions for form inputs (autocapture only records clicks, not typed values)
- Test each selector in DevTools with `document.querySelector('...')` on the target site

### Real-world example

Here's a real `$mp_click` event from an Amazon browsing session (trimmed for clarity) and what the script produces:

**Raw event:**

```json
{
	"event": "$mp_click",
	"properties": {
		"time": 1773769629,
		"$el_tag_name": "img",
		"$el_classes": [""],
		"$current_url": "https://www.amazon.com/",
		"$elements": [
			{ "$tag_name": "img", "$classes": [""], "$nth_child": 1 },
			{
				"$tag_name": "a",
				"$attr-href": "/ROSSO-CAFFE.../dp/B0F7S9H5YJ/...",
				"$classes": ["a-link-normal", "heroBlock0", "a-text-normal"]
			},
			{ "$tag_name": "div", "$classes": ["a-section", "a-spacing-small"] },
			{
				"$tag_name": "div",
				"$classes": ["a-cardui"],
				"$id": "CardInstance4jMpZl1aYjl7SdRCWBqtyA"
			},
			{ "$tag_name": "div", "$id": "desktop-btf-grid-1" }
		]
	}
}
```

**What the script does:**

1. Target element (`$elements[0]`) is `img` with no `$id` and empty `$classes` -- can't use those
2. Walk up ancestors: `a` (no ID), `div` (no ID), `div` with `$id: "CardInstance4jMpZl1aYjl7SdRCWBqtyA"` -- found an ancestor ID
3. Target has no usable classes, so use tag name scoped under ancestor

**Script output:**

```json
{ "action": "click", "selector": "#CardInstance4jMpZl1aYjl7SdRCWBqtyA img" }
```

**After manual cleanup**, you might simplify this to target the product link instead:

```json
{ "action": "click", "selector": "#desktop-btf-grid-1 .a-link-normal" }
```

This is why the script output is a starting point -- always review and test selectors on the actual site.

### Tips for good selectors

- **Use IDs when possible**: `#checkout-btn` is stable and fast.
- **Use data attributes**: `[data-testid="submit"]` survives CSS refactors.
- **Avoid positional selectors**: `div > div:nth-child(3) > button` breaks easily.
- **Test selectors**: Open DevTools on the target site, run `document.querySelector('your-selector')` to verify.
- **Escape special chars**: Radix/shadcn IDs need double-backslash escaping in JSON: `#radix-\\:R1afnnja\\:-trigger-investments`

---

## Step 3: Tune the Funnel

Two controls shape how strictly meeples follow your sequence:

### Temperature (0-10)

Controls the per-action probability of following the sequence vs. doing something random.

```
temperature 10  ████████████████████  strict: ~100% of actions follow sequence
temperature  8  ████████████████░░░░  focused: ~80% follow, some wandering
temperature  5  ██████████░░░░░░░░░░  balanced: coin flip each action
temperature  2  ████░░░░░░░░░░░░░░░░  loose: mostly random, occasional sequence
temperature  0  ░░░░░░░░░░░░░░░░░░░░  explorer: ignores sequence entirely
```

For each action in your sequence, the meeple rolls `Math.random() * 10 < effectiveTemperature`. If it passes, the defined action runs. If not, the meeple does a random action instead (click, scroll, mouse movement, or form interaction).

### Chaos-range ([min, max])

Adds run-to-run variability to the temperature. The chaos multiplier is calculated as:

```
chaosMultiplier = random(min, max) / 10
effectiveTemperature = clamp(temperature * chaosMultiplier, 0, 10)
```

| Config                      | Effective Temp Range | Behavior                                            |
| --------------------------- | -------------------- | --------------------------------------------------- |
| `temp: 10, chaos: [10, 10]` | exactly 10           | perfectly deterministic (no variation)              |
| `temp: 10, chaos: [8, 10]`  | 8.0 - 10.0           | very consistent, minor variation                    |
| `temp: 8, chaos: [1, 2]`    | 0.8 - 1.6            | surprisingly low! mostly random with some structure |
| `temp: 7, chaos: [1, 3]`    | 0.7 - 2.1            | lots of deviation                                   |

**Common gotcha**: chaos-range values are divided by 10, so `[1, 2]` means a multiplier of 0.1 to 0.2, NOT 1.0 to 2.0. For a tight, predictable funnel, use `[10, 10]` (multiplier = 1.0). For slight variation, try `[8, 10]` (multiplier = 0.8-1.0).

### Recommended configs

| Goal                               | Temperature | Chaos-range | Effective Temp |
| ---------------------------------- | ----------- | ----------- | -------------- |
| Strict replay (demos, testing)     | 10          | [10, 10]    | 10.0           |
| Realistic funnel (production-like) | 9           | [8, 10]     | 7.2 - 9.0      |
| Loose funnel (organic feel)        | 7           | [7, 10]     | 4.9 - 7.0      |
| Mostly random with a nudge         | 5           | [4, 8]      | 2.0 - 4.0      |
| Pure explorer                      | 0           | [1, 1]      | 0.0            |

---

## Step 4: Control Conversion Rate & Drop-off

There's no explicit "conversion rate" parameter. Instead, you model drop-off by creating **multiple sequences at different funnel depths** and controlling how many users get each one.

### The pattern

Say your funnel is: Browse > Add to Cart > Checkout > Purchase. You want:

- 40% of users to complete the full funnel
- 30% to drop off at checkout
- 30% to bounce after browsing

Create three sequences:

```json
{
	"full-purchase-1": {
		"description": "Complete the full purchase funnel",
		"temperature": 9,
		"chaos-range": [9, 10],
		"actions": [
			{ "action": "click", "selector": "#browse-products" },
			{ "action": "click", "selector": "#add-to-cart" },
			{ "action": "click", "selector": "#checkout" },
			{ "action": "type", "selector": "#email", "text": "buyer@example.com" },
			{ "action": "click", "selector": "#complete-purchase" }
		]
	},
	"full-purchase-2": {
		"description": "Complete the full purchase funnel (copy for weighting)",
		"temperature": 9,
		"chaos-range": [9, 10],
		"actions": [
			{ "action": "click", "selector": "#browse-products" },
			{ "action": "click", "selector": "#add-to-cart" },
			{ "action": "click", "selector": "#checkout" },
			{ "action": "type", "selector": "#email", "text": "buyer@example.com" },
			{ "action": "click", "selector": "#complete-purchase" }
		]
	},
	"checkout-dropout": {
		"description": "Gets to checkout but abandons",
		"temperature": 9,
		"chaos-range": [8, 10],
		"actions": [
			{ "action": "click", "selector": "#browse-products" },
			{ "action": "click", "selector": "#add-to-cart" },
			{ "action": "click", "selector": "#checkout" }
		]
	},
	"browse-only": {
		"description": "Browses products but never adds to cart",
		"temperature": 7,
		"chaos-range": [8, 10],
		"actions": [
			{ "action": "click", "selector": "#browse-products" },
			{ "action": "click", "selector": ".product-card" }
		]
	},
	"browse-only-2": {
		"description": "Browses products but never adds to cart (copy for weighting)",
		"temperature": 7,
		"chaos-range": [8, 10],
		"actions": [
			{ "action": "click", "selector": "#browse-products" },
			{ "action": "click", "selector": ".product-card" }
		]
	}
}
```

### How distribution works

Sequences are assigned to users **round-robin by key order**. With 5 sequences and 10 users:

```
User 0  -> full-purchase-1      (completes)
User 1  -> full-purchase-2      (completes)
User 2  -> checkout-dropout     (drops at checkout)
User 3  -> browse-only          (bounces)
User 4  -> browse-only-2        (bounces)
User 5  -> full-purchase-1      (completes)     <- cycle repeats
User 6  -> full-purchase-2      (completes)
User 7  -> checkout-dropout     (drops at checkout)
User 8  -> browse-only          (bounces)
User 9  -> browse-only-2        (bounces)
```

Result: 40% complete, 20% checkout drop-off, 40% browse-only. (Close to our target of 40/30/30.)

### Ratio math

To hit a target conversion rate:

```
number of sequence copies = (target % / 100) * total sequences
```

For 10 users with 60% conversion, 25% cart abandon, 15% bounce:

- 3 copies of complete-funnel sequences (60% of 5 ≈ 3)
- 1 copy of cart-abandon sequence (20%)
- 1 copy of bounce sequence (20%)

For finer control, increase both user count and sequence count proportionally.

### The `requireActive` flag

Use `requireActive: true` on click actions to gracefully handle conditional UI states. If the target element is disabled, the action is skipped (marked as `skipped: true` in results) without counting as a failure:

```json
{ "action": "click", "selector": "#submit-order", "requireActive": true }
```

**What it checks:**

- Element has `disabled` attribute
- Element has `disabled` CSS class

**When to use:**

- Buttons that only activate after form validation
- Optional UI elements (modals, upsells that may not appear)
- Conditional features that depend on user state

**Important:** Skipped actions do NOT count toward the circuit breaker failure limit.

### The `expectsNavigation` flag

Use `expectsNavigation: true` on actions that trigger page navigation (links, form submissions):

```json
{
	"action": "click",
	"selector": "#next-page-link",
	"expectsNavigation": true,
	"navigationTimeout": 10000
}
```

**What it does:**

- Waits for `domcontentloaded` event on the new page
- Prevents race conditions where next action runs on old page
- Times out after `navigationTimeout` (default: 5000ms)

**When to use:**

- Multi-page checkout flows
- Form submissions that redirect
- Any link that navigates to a new URL

**Before this feature existed:** You had to insert manual wait actions or accept unreliable sequences.

---

## Step 4.5: Configure Circuit Breaker

The circuit breaker prevents sequences from getting stuck when selectors fail repeatedly. **As of v2.0, it's fully configurable.**

### Default behavior (backwards compatible)

```json
{
  "my-funnel": {
    "actions": [...]
    // Default: maxFailures=3, mode=terminate, resetOnSuccess=true
  }
}
```

After 3 consecutive failed actions, the sequence terminates.

### Production-ready configuration

For real-world sites with dynamic content (React SPAs, lazy-loaded elements, modals), increase the failure threshold:

```json
{
  "my-funnel": {
    "circuitBreaker": {
      "maxFailures": 5,
      "resetOnSuccess": true,
      "mode": "skip"
    },
    "actions": [...]
  }
}
```

**Parameters:**

| Field            | Type    | Default     | Description                                          |
| ---------------- | ------- | ----------- | ---------------------------------------------------- |
| `maxFailures`    | number  | 3           | Consecutive failures before circuit breaker triggers |
| `resetOnSuccess` | boolean | true        | Reset failure counter after ANY successful action    |
| `mode`           | string  | "terminate" | `"terminate"` stops sequence, `"skip"` continues     |

**Mode comparison:**

- **`terminate`** (default): Stop entire sequence after hitting `maxFailures`. Use for strict testing/demos.
- **`skip`**: Continue sequence, skip failed actions. Use for funnel replay where partial completion is valuable.

**Real-world example:**

A 7-step checkout flow with dynamic autocomplete and lazy-loaded modals:

```json
{
	"checkout": {
		"description": "Multi-page checkout with optional upsell modal",
		"temperature": 8,
		"circuitBreaker": {
			"maxFailures": 5,
			"resetOnSuccess": true,
			"mode": "skip"
		},
		"actions": [
			{ "action": "click", "selector": ".product" },
			{ "action": "click", "selector": "#add-to-cart" },
			{
				"action": "click",
				"selector": "#upsell-modal-accept",
				"requireActive": true
			},
			{ "action": "click", "selector": "#checkout", "expectsNavigation": true },
			{
				"action": "type",
				"selector": "#email",
				"text": "customer@example.com"
			},
			{
				"action": "click",
				"selector": "#autocomplete-suggestion",
				"requireActive": true
			},
			{ "action": "click", "selector": "#complete-order" }
		]
	}
}
```

With `maxFailures: 5` and `mode: skip`:

- If autocomplete doesn't appear → skipped, sequence continues
- If modal doesn't appear → skipped via `requireActive`
- Only hard failures (element truly missing) count toward circuit breaker
- Sequence reaches checkout page even if 2-3 steps fail

### Debug mode

Enable verbose logging to troubleshoot selector failures:

```json
{
  "my-funnel": {
    "debug": true,
    "actions": [...]
  }
}
```

**Debug output includes:**

- Detailed selector matching attempts
- Element visibility checks (width, height, display, visibility)
- Circuit breaker state (failures counted: 2/5)
- Navigation events and timing
- Specific failure reasons (selector_not_found, timeout, element_not_visible)

**Tip:** Enable debug mode during development, disable for production runs to reduce log noise.

---

## Step 5: Add Explorer Meeples

To let some meeples roam freely without following any funnel, add a sequence with `temperature: 0`. At temperature 0, every action roll fails the `Math.random() * 10 < 0` check, so the meeple does random exploration for each step instead.

```json
{
	"checkout-funnel": {
		"description": "Complete checkout flow",
		"temperature": 9,
		"chaos-range": [9, 10],
		"actions": [
			{ "action": "click", "selector": "#add-to-cart" },
			{ "action": "click", "selector": "#checkout" },
			{ "action": "click", "selector": "#purchase" }
		]
	},
	"explorer": {
		"description": "Free exploration - meeple wanders the site randomly",
		"temperature": 0,
		"chaos-range": [1, 1],
		"actions": [
			{ "action": "click", "selector": "body" },
			{ "action": "click", "selector": "body" },
			{ "action": "click", "selector": "body" },
			{ "action": "click", "selector": "body" },
			{ "action": "click", "selector": "body" },
			{ "action": "click", "selector": "body" },
			{ "action": "click", "selector": "body" },
			{ "action": "click", "selector": "body" }
		]
	}
}
```

The explorer actions are placeholders -- they'll never actually execute because temperature is 0. But you need actions in the array because the loop iterates over `actions.entries()`. Each iteration triggers a random action (exploratory click, scroll, mouse movement, or form interaction) instead. **More placeholder actions = more random actions the explorer performs.**

With 2 sequences and 10 users: 5 follow the funnel, 5 explore. Adjust the ratio with duplicated keys as described in Step 4.

---

## Step 6: Send the Job

### Via the API (programmatic)

```bash
curl -X POST https://npc-mixpanel-api-lmozz6xkha-uc.a.run.app/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "you@mixpanel.com",
    "safe_word": "pickles",
    "url": "https://your-target-site.com",
    "users": 10,
    "concurrency": 5,
    "sequences": {
      "my-funnel": {
        "description": "Main checkout funnel",
        "temperature": 9,
        "chaos-range": [9, 10],
        "actions": [
          {"action": "click", "selector": "#add-to-cart"},
          {"action": "click", "selector": "#checkout"},
          {"action": "click", "selector": "#purchase"}
        ]
      }
    }
  }'
```

### Load sequence from a file

```bash
# Build the request body by merging params with a sequence file
jq -n \
  --arg url "https://your-site.com" \
  --argjson users 10 \
  --argjson sequences "$(cat sequences/my-funnel.json)" \
  '{
    user_id: "you@mixpanel.com",
    safe_word: "pickles",
    url: $url,
    users: $users,
    sequences: $sequences
  }' | curl -X POST https://npc-mixpanel-api-lmozz6xkha-uc.a.run.app/simulate \
    -H "Content-Type: application/json" \
    -d @-
```

Note: if your sequence file is a single flat sequence (like the KYC example), wrap it in a named key first:

```bash
# Wrap a flat sequence in a named key
jq '{"my-funnel": .}' sequences/financial-sequence-kyc.json
```

### Via the UI

Open the meeple UI at `https://meeple.mixpanel.org`, paste your sequence JSON into the sequences field, set user count, and run.

### Response format

```json
{
	"results": [
		{
			"actions": [
				{
					"action": "click",
					"selector": "#add-to-cart",
					"success": true,
					"duration": 245,
					"timestamp": 1647891234567,
					"page_url": "https://example.com/products"
				},
				{
					"action": "click",
					"selector": "#missing-element",
					"success": false,
					"error": "Element not found: #missing-element",
					"reason": "selector_not_found",
					"duration": 5234,
					"timestamp": 1647891239801,
					"page_url": "https://example.com/cart"
				},
				{
					"action": "click",
					"selector": "#disabled-button",
					"success": true,
					"skipped": true,
					"duration": 123,
					"timestamp": 1647891245035,
					"page_url": "https://example.com/cart"
				}
			],
			"duration": 12,
			"persona": "researcher",
			"sequence": "my-funnel",
			"success": true,
			"circuit_breaker_triggered": false,
			"failed_actions": [
				{
					"action": "click",
					"selector": "#missing-element",
					"reason": "selector_not_found",
					"page_url": "https://example.com/cart"
				}
			]
		}
	]
}
```

**New fields (v2.0):**

| Field                       | Type    | Description                                                                                |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `circuit_breaker_triggered` | boolean | Whether circuit breaker stopped the sequence                                               |
| `failed_actions`            | array   | All actions that failed (excludes skipped)                                                 |
| `action.page_url`           | string  | URL when action was attempted                                                              |
| `action.reason`             | string  | Failure reason: `selector_not_found`, `timeout`, `element_not_visible`, `element_detached` |
| `action.skipped`            | boolean | True if `requireActive` caused skip                                                        |

**Use cases:**

- **Debugging selectors:** Check `failed_actions` to see which selectors are broken
- **Funnel analysis:** `circuit_breaker_triggered: true` indicates the sequence was incomplete
- **Multi-page tracking:** Use `page_url` to see where in the flow failures occurred

---

## Reference

### Limits

| Parameter            | Limit                                          |
| -------------------- | ---------------------------------------------- |
| Max users per job    | 25                                             |
| Max concurrency      | 10                                             |
| Session timeout      | 10 minutes per meeple                          |
| Page load timeout    | 1 minute                                       |
| Element wait timeout | 5 seconds (+ 1s retry)                         |
| Circuit breaker      | Configurable (default: 3 consecutive failures) |
| Navigation timeout   | Configurable (default: 5000ms)                 |

### Validation rules

- `temperature`: number, 0-10 (default: 5)
- `chaos-range`: array of exactly 2 numbers, `[min, max]` where min <= max (default: [1, 1])
- `actions`: non-empty array of action objects
- Each action must have `action` (string) and `selector` (string)
- `type` actions require `text` field
- `select` actions require `value` field
- Action types are case-insensitive: `click`, `type`, `select`, `fillOutForm`

### Human-like behavior (automatic)

Between every action, meeples automatically:

- Wait 500-2000ms (random delay)
- 30% chance of bonus behavior: mouse movement, scroll, or idle pause
- Click position fuzz: +/-35% offset from element center
- Typing delay: 50-150ms between characters

### Debugging tips

- **Enable debug mode** (`"debug": true`) for verbose selector matching logs
- Watch the meeple tabs in the UI for real-time logs per meeple
- Look for `Temperature bypass - random action` messages to see when meeples deviate
- Check `Effective temperature` in the logs to verify your chaos-range math
- Failed actions log the selector and error -- use this to fix broken selectors
- `skipped: true` in results means `requireActive` caused a skip (not a failure)
- Check `circuit_breaker_triggered` in results to see if sequence was incomplete
- Use `failed_actions` array to identify problematic selectors
- Check `action.reason` for specific failure types: `selector_not_found`, `timeout`, `element_not_visible`
- Use `action.page_url` to see which page the failure occurred on (helpful for multi-page flows)

### Mixpanel Session Replay considerations

**Critical timing issue:** The Mixpanel SDK batches Session Replay data every 10 seconds before sending.

**Impact on multi-page sequences:**

- Events are tracked immediately
- Replay video data is buffered for 10s
- If your sequence completes in <10s, replay data may be lost

**Solutions:**

1. **Add wait actions between pages** (crude but works):

   ```json
   { "action": "click", "selector": "#page1-btn", "expectsNavigation": true },
   { "action": "wait", "duration": 10000 },  // Wait for buffer flush
   { "action": "click", "selector": "#page2-btn" }
   ```

2. **Use longer sequences** (15+ seconds naturally avoid this issue)

3. **Test with Session Replay enabled** in mpTweaks to verify replay data appears

**This only affects Session Replay.** Event tracking always works immediately.
