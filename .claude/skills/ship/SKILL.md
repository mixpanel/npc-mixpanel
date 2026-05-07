---
name: ship
description: |
  Verify, commit, push, create PR, and deploy to Cloud Run via CI. Use when the
  user says "ship it", "ship", "deploy", "push and merge", or asks to commit and
  deploy changes. This project deploys TWO Cloud Run services (UI + API) from a
  single CI pipeline. Handles: picking up ALL local changes (not just this
  session's), running /verify, creating PRs, and auto-merging. Returns the PR URL
  and GitHub Action link immediately — does not wait for CI to finish.
---

# Ship

Verify, commit, and deploy changes to production via CI. Both services (UI + API) deploy from one push to main.

## Step 1: Verify first

Run the `/verify` skill. If anything fails, stop and report.

```bash
npm run validate && npm test
```

**Note:** Typecheck has known pre-existing errors in `forms.js` and `interactions.js`. Only fail on NEW errors — compare against known baseline (6 TS errors in forms.js, 1 unused var in interactions.js).

## Step 2: Gather ALL changes

Pick up everything — not just changes this Claude session made. The user often edits configs or makes changes before starting Claude.

```bash
git status
git diff --stat
git log --oneline -5
```

If `package.json` or `package-lock.json` are modified, they MUST be staged. Cloud Run builds from the git tree — unstaged lockfile = old version in prod.

## Step 3: Branch, stage, and commit

```bash
BRANCH=$(git branch --show-current)
```

If on `main`, create a feature branch derived from the changes.

Stage relevant files (never `.env`, `service-account.json`, `gcp-service-account-key.json`, or `node_modules`). Commit:

```bash
git commit -m "$(cat <<'EOF'
<subject line>

<optional body>

Co-Authored-By: AK <ak@mixpanel.com>
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Step 4: Push, PR, auto-merge

```bash
git push -u origin <branch-name>

gh pr create --title "<short title>" --body "$(cat <<'EOF'
## Summary
<bullet points>

## Services affected
- **UI** (`npc-mixpanel`) — Cloud Run, private/IAP
- **API** (`npc-mixpanel-api`) — Cloud Run, public

## Test plan
- [x] `npm run validate` passes
- [x] `npm test` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr merge <PR_NUMBER> --auto --squash --delete-branch
```

## Step 5: Report and return

Don't wait for CI. Report immediately:

- PR URL
- GitHub Actions link (from `gh run list --limit 1`)
- What's deploying (one-line summary)
- Reminder: CI deploys **both** UI and API services

Then clean up:

```bash
git checkout main && git pull
```

## Important

- **Never `npm run deploy`** from local — all deploys through CI (GitHub Actions → Cloud Build)
- **Never force push** or amend published commits
- **Never skip CI checks**
- **Never merge to main directly** — always go through a PR
- CI pipeline: GitHub Actions triggers Cloud Build twice (once per `cloudbuild.yaml` and `cloudbuild-api.yaml`)
- If auto-merge fails with "no required protected branch rules", fall back to
  `gh pr checks <PR_NUMBER> --watch && gh pr merge <PR_NUMBER> --squash --delete-branch`
