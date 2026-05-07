---
name: verify
description: |
  Run all quality checks before shipping. Use when the user says "verify",
  "check everything", "run checks", or before any deploy/ship operation.
  Runs typecheck, lint, format check, and tests. Reports pass/fail with
  awareness of known pre-existing issues.
---

# Verify

Run all quality gates. This is the pre-ship checklist.

## Step 1: Run validate (typecheck + lint + format)

```bash
npm run validate
```

### Known pre-existing typecheck errors (do NOT fail on these)

The following errors exist in the codebase and are not regressions:

- `meeple/forms.js` — 5 TS2345 errors: `ElementHandle<Node>` not assignable to `ElementHandle<Element>` (lines 486, 489, 492, 497, 499)
- `meeple/interactions.js` — 1 TS6133 error: `hotZones` declared but never read (line 1306)
- `meeple/sequences.js` — uses `@ts-nocheck` (suppresses all TS errors in that file)

**Total known: 6 errors.** If typecheck reports exactly these 6, it's a pass. If there are NEW errors beyond these, it's a fail.

## Step 2: Run lint

If validate passed lint already ran. If validate failed on typecheck, run lint separately:

```bash
npm run lint
```

Lint must pass clean — zero warnings, zero errors.

## Step 3: Run format check

```bash
npm run format:check
```

If formatting issues found, fix with `npm run format` and re-check.

## Step 4: Run tests

```bash
npm test
```

Tests must pass. If tests fail, investigate and report — do not ship.

## Reporting

Summarize results as:

```
✓ Typecheck: pass (6 known pre-existing errors, no new errors)
✓ Lint: pass
✓ Format: pass
✓ Tests: pass (X tests, X suites)
```

Or flag failures clearly with the specific error output.
