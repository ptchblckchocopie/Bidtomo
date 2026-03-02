# Staging to Main — Production Deploy

You are about to help the user create a Pull Request from `staging` into `main`, verify it passes all checks, fix any issues, and merge it for production deployment.

**This targets production — be thorough and careful.**

## Steps

### Step 1: Check for uncommitted changes

Run `git status --short`. If there are uncommitted changes, warn the user and ask if they want to commit or stash first. Do not proceed until the working tree is clean.

### Step 2: Ensure staging is up to date

1. Run `git fetch origin` to get the latest remote state.
2. Run `git checkout staging` (if not already on it).
3. Check if `origin/staging` has commits the local branch doesn't:
   - Run `git log HEAD..origin/staging --oneline`
   - If there are incoming commits, run `git pull origin staging` to sync.
4. Confirm staging is now in sync: `git log origin/staging..HEAD --oneline` should be empty.
5. Push any local-only commits: if `git log origin/staging..HEAD --oneline` shows commits before pull, run `git push origin staging`.

### Step 3: Check what will be in the PR

Run these commands to understand what staging has that main doesn't:
- `git log origin/main..origin/staging --oneline` to see commits that will be in the PR
- `git diff origin/main..origin/staging --stat` to see changed files summary
- `git diff origin/main..origin/staging` to read the actual diff (don't dump raw to user)

If there are **no commits** to merge, tell the user "Nothing to merge — main is up to date with staging." and stop.

### Step 4: Check for conflicts

1. Do a dry-run merge to detect conflicts:
   ```
   git checkout -B temp-merge-check origin/main
   git merge --no-commit --no-ff origin/staging
   ```
2. Check for conflicts with `git diff --name-only --diff-filter=U`.
3. **Abort the test merge immediately:** `git merge --abort && git checkout staging`

If there are **no conflicts**, note "Clean merge — no conflicts detected."

If there **are conflicts**, list each conflicted file and for each one:
- Read the file and explain what both sides changed
- Suggest how to resolve it (which version to keep, or how to combine both)
- Note whether it's a logic conflict (needs careful review) or a trivial conflict (formatting, generated files, lock files)

**Do NOT resolve the conflicts yourself at this step.** Just report them — they will be resolved in Step 10 if the user confirms.

### Step 5: Run type-checking (CI gates)

Run the same checks that GitHub Actions will run, **in parallel**:

1. **CMS type-check:**
   ```bash
   cd cms && npm ci && npx tsc --noEmit
   ```
2. **Frontend type-check:**
   ```bash
   cd frontend && npm ci && npm run check
   ```

Report the results:
- If **both pass**: "CI gates passed."
- If **either fails**: Show the errors. These MUST be fixed before merging. Proceed to Step 5a.

#### Step 5a: Fix type-check errors (if any)

If type-check errors were found:
1. Read the failing files and understand the errors.
2. Fix each error — prefer minimal, targeted fixes.
3. Commit the fixes to `staging` with a descriptive message.
4. Push to `origin/staging`: `git push origin staging`.
5. Re-run the failing type-check to confirm it passes now.
6. If it still fails, repeat. If you cannot fix it after 3 attempts, STOP and ask the user for help.

### Step 6: Verify staging health (pre-PR sanity check)

Before creating the PR, verify the staging services are healthy. Run these health checks **in parallel**:

1. **CMS Health:** `curl -s --max-time 10 https://cms-staging-v2.up.railway.app/api/health`
   - Expect JSON with `status: "ok"`.
   - Check `redis` and `elasticsearch` fields.

2. **SSE Health:** `curl -s --max-time 10 https://sse-service-staging-v2.up.railway.app/health`
   - Expect JSON with `status` and `redis` fields.

3. **Staging Frontend:** `curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://bidtomo-git-staging-ptchblckchocopies-projects.vercel.app/`
   - Expect HTTP 200.

Generate a health status table:

```
### Staging Health

| Service       | Status          | Redis | Elasticsearch |
|---------------|-----------------|-------|---------------|
| CMS           | ✓ OK / ✗ Down   | ✓ / ✗ | ✓ / ✗ / N/A  |
| SSE           | ✓ OK / ✗ Down   | ✓ / ✗ | N/A           |
| Frontend      | ✓ OK / ✗ Down   | N/A   | N/A           |
```

- If **CMS is down**: WARN. Code may be broken in staging — flag this in the PR description.
- If **SSE is down**: WARN. Real-time features may not work. Flag it.
- If **Frontend returns non-200**: WARN. Possible build issue.
- If services are **unreachable/timeout**: Note as "Unreachable (may be sleeping)". Non-blocking.

### Step 7: Generate the report

Show the user this report:

```
## Production Deploy Report: staging → main

**Date:** <current date>
**Commits in PR:** <count>

### CI Gates

| Check | Result |
|-------|--------|
| CMS `tsc --noEmit` | ✓ Pass / ✗ Fail (fixed) |
| Frontend `svelte-check` | ✓ Pass / ✗ Fail (fixed) |

### Staging Health

| Service       | Status | Redis | Elasticsearch |
|---------------|--------|-------|---------------|
| CMS           | ...    | ...   | ...           |
| SSE           | ...    | ...   | ...           |
| Frontend      | ...    | N/A   | N/A           |

### Commits
<list each commit: hash + message>

### Files Changed
<count> files changed, <insertions> insertions, <deletions> deletions

### Summary
<2-4 bullet points describing WHAT changed and WHY, grouped by feature/fix>

### Conflicts
<if conflicts detected in Step 4, list them with suggested resolutions>
<if no conflicts: "Clean merge — no conflicts detected.">

### What Will Happen When Merged
1. **GitHub Actions** will deploy CMS, SSE service, and bid-worker to **Railway production**
2. **Vercel** will auto-deploy frontend to **bidmo.to** (production)

### Potential Risks
<any concerns: breaking changes, DB migrations, env var changes needed, schema changes, security-sensitive changes>
<if DB migrations are included, WARN that they will auto-run on deploy>
```

### Step 8: Final confirmation — MANDATORY

**CRITICAL: You MUST stop here and wait for the user's explicit response. Do NOT create the PR or merge under any circumstances until the user replies.**

After showing the full report, ask the user:

> This will create a Pull Request from `staging` → `main`, wait for CI checks to pass, and then **merge it to production**.
>
> **Do you want to proceed? (yes/no)**

Then STOP. Do not run any gh command. Wait for the user to respond in a new message.

- If the user says **yes / y / go / create / do it / confirm / merge** → proceed to Step 9.
- If the user says **no / n / stop / cancel / wait / not yet** or anything other than a clear yes → acknowledge and stop.
- If the user asks to change something first → help them make the change, then re-run from Step 3.

### Step 9: Create the Pull Request

Only run this step AFTER the user has explicitly confirmed in Step 8.

Create the PR using `gh pr create`:

```bash
gh pr create \
  --base main \
  --head staging \
  --title "Production Deploy: <brief summary of changes>" \
  --body "$(cat <<'EOF'
## Production Deploy: staging → main

### Summary
<2-4 bullet points from the report>

### Commits
<list each commit: hash + message>

### Files Changed
<count> files changed, <insertions> insertions, <deletions> deletions

### Staging Health at PR Creation
| Service | Status | Redis | Elasticsearch |
|---------|--------|-------|---------------|
| CMS     | ...    | ...   | ...           |
| SSE     | ...    | ...   | ...           |
| Frontend| ...    | N/A   | N/A           |

### What Happens on Merge
1. **GitHub Actions** deploys CMS, SSE, bid-worker to **Railway production**
2. **Vercel** auto-deploys frontend to **bidmo.to**

### Potential Risks
<risks from report, or "None identified.">

---
Generated with [Claude Code](https://claude.ai/code)
EOF
)"
```

### Step 10: Wait for CI checks and fix issues

After creating the PR, monitor CI checks:

1. Run `gh pr checks <PR_NUMBER> --watch` to wait for checks to complete (use a reasonable timeout).
   - If the command hangs or is unavailable, poll with `gh pr checks <PR_NUMBER>` every 30 seconds, up to 10 minutes.

2. If **all checks pass**, proceed to Step 11.

3. If **any check fails**:
   a. Run `gh pr checks <PR_NUMBER>` to identify which checks failed.
   b. For failed GitHub Actions workflows, fetch the logs: `gh run view <RUN_ID> --log-failed` to understand the failure.
   c. Read the error output and identify the root cause.
   d. Fix the issue on the `staging` branch:
      - Make the fix locally
      - Commit with a descriptive message (e.g., "Fix type error in cms/src/server.ts for production deploy")
      - Push to `origin/staging`: `git push origin staging`
   e. The PR will automatically update. Wait for checks to re-run.
   f. Repeat up to **3 fix attempts**. If checks still fail after 3 attempts, STOP and tell the user:
      > CI checks are still failing after 3 fix attempts. Please review the errors manually.
      > **PR:** <PR URL>
   g. Do NOT merge if checks are failing.

### Step 11: Pre-merge summary and confirmation — MANDATORY

**CRITICAL: You MUST stop here and wait for the user's explicit response. Do NOT merge under any circumstances until the user replies.**

After all CI checks have passed, show a final summary:

```
## Ready to Merge: staging → main

**PR:** <PR URL>
**CI Status:** All checks passed ✓

### Issues Fixed During This Process
<if any type-check errors were fixed in Step 5a, list them: file, what was wrong, what was fixed>
<if any CI failures were fixed in Step 10, list them: what failed, what was fixed>
<if nothing was fixed: "No issues — all checks passed on first run.">

### Commits Being Merged
<list each commit: hash + message, INCLUDING any fix commits added during this process>

### What Happens Now
1. **GitHub Actions** deploys CMS, SSE, bid-worker to **Railway production**
2. **Vercel** auto-deploys frontend to **bidmo.to**
```

Then ask:

> Everything above is ready to go. This will **merge to main and trigger production deployment**.
>
> **Merge to production? (yes/no)**

Then STOP. Wait for the user to respond in a new message.

- If the user says **yes / y / go / merge / do it / confirm** → proceed to Step 12.
- If the user says **no / n / stop / cancel / wait / not yet** or anything other than a clear yes → acknowledge and stop. The PR remains open for manual review.
- If the user asks to change something → help them, push to staging, wait for CI to re-pass, then show this summary again.

### Step 12: Merge the Pull Request

Only run this step AFTER the user has explicitly confirmed in Step 11.

```bash
gh pr merge <PR_NUMBER> --merge --delete-branch=false
```

**IMPORTANT:** Use `--delete-branch=false` to keep the `staging` branch alive.

After merging, show the user:

```
### Production Deploy Complete

**PR:** <PR URL> (merged)

**Deployments triggered:**
1. **Backend (Railway):** https://github.com/ptchblckchocopie/Bidtomo/actions
   - CMS, SSE service, and bid-worker deploying to production
2. **Frontend (Vercel):** auto-deploying to https://bidmo.to

**Monitor deployments:**
- Railway: check GitHub Actions for deploy status
- Vercel: check https://vercel.com/ptchblckchocopies-projects for deploy status

**Note:** Stay on `staging` branch for continued development.
```

### Step 13: Post-merge sync

After the merge, sync the local staging branch:

```bash
git checkout staging
git fetch origin
git pull origin staging
```

## Rules

- **TWO confirmations required.** Step 8 (before creating PR) and Step 11 (before merging). NEVER skip either — always wait for explicit "yes".
- **NEVER force push to main.** All production deploys go through PR merges.
- **NEVER merge with failing CI checks.** Fix the issues first or stop and ask the user.
- **NEVER delete the staging branch.** Always use `--delete-branch=false` when merging.
- **Fix issues on staging, not main.** All fixes go through the staging branch and into the PR.
- Keep the summary human-readable — no raw diffs in the output, just the report.
- If ALL staging services are down, strongly recommend fixing staging before creating the PR.
- Health checks should have a 10-second timeout — don't hang waiting for unresponsive services.
- After everything, ensure you are back on the `staging` branch.
- If conflicts exist and the user confirms to proceed, resolve them during the merge process. Prefer keeping both changes when they don't contradict; prefer the staging version for logic changes.
