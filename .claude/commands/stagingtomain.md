# Staging to Main — Production Merge & Deploy

You are about to help the user merge the `staging` branch into `main` for a production deployment. This will trigger: (1) GitHub Actions deploying CMS, SSE service, and bid-worker to Railway production, and (2) Vercel auto-deploying the frontend to production at `bidmo.to`.

**This is a production deploy — be thorough and careful.**

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

### Step 3: Ensure main is up to date

1. Run `git checkout main`.
2. Run `git pull origin main` to sync with remote.
3. If pull fails due to divergence, use `git pull --rebase origin main`.

### Step 4: Check what will be merged

Run these commands to understand what staging has that main doesn't:
- `git log main..staging --oneline` to see commits that will be merged
- `git diff main..staging --stat` to see changed files summary
- `git diff main..staging` to read the actual diff (don't dump raw to user)

If there are **no commits** to merge, tell the user "Nothing to merge — main is up to date with staging." and stop.

### Step 5: Verify staging health (pre-merge sanity check)

Before merging, verify the staging services are healthy (these are the same code that will be deployed to production). Run these health checks **in parallel**:

1. **CMS Health:** `curl -s --max-time 10 https://cms-staging-v2.up.railway.app/api/health`
   - Expect JSON with `status: "ok"`.
   - Check `redis` and `elasticsearch` fields.

2. **SSE Health:** `curl -s --max-time 10 https://sse-service-staging-v2.up.railway.app/health`
   - Expect JSON with `status` and `redis` fields.

3. **Staging Frontend:** `curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://bidtomo-git-staging-ptchblckchocopies-projects.vercel.app/`
   - Expect HTTP 200.

Generate a health status table:

```
### Staging Health (Pre-Merge)

| Service       | Status          | Redis | Elasticsearch |
|---------------|-----------------|-------|---------------|
| CMS           | ✓ OK / ✗ Down   | ✓ / ✗ | ✓ / ✗ / N/A  |
| SSE           | ✓ OK / ✗ Down   | ✓ / ✗ | N/A           |
| Frontend      | ✓ OK / ✗ Down   | N/A   | N/A           |
```

- If **CMS is down**: STOP. Code is broken in staging — do NOT merge to production. Ask the user to fix staging first.
- If **SSE is down**: WARN. Real-time features won't work in production. Flag it.
- If **Frontend returns non-200**: WARN. Possible build issue.
- If services are **unreachable/timeout**: Note as "Unreachable (may be sleeping)". Non-blocking but flag it.

### Step 6: Merge staging into main

1. Make sure you're on `main`: `git checkout main`
2. Run `git merge staging --no-ff -m "Merge staging into main for production deploy"`
   - The `--no-ff` flag preserves the merge commit for clear history.
   - If the merge succeeds cleanly, continue to Step 7.
   - If there are **merge conflicts**:
     a. Run `git diff --name-only --diff-filter=U` to list conflicted files.
     b. For each conflicted file, read it, understand both sides of the conflict, and resolve it:
        - **Prefer the staging version** (that's the code we want to deploy).
        - If main has hotfixes not in staging, keep both changes.
        - For `package-lock.json`: delete and regenerate with `npm install` in the affected directory.
        - For generated files (`payload-types.ts`, etc.): prefer the staging version.
     c. After resolving, stage files with `git add <file>` and complete with `git commit`.
     d. Show the user exactly what conflicts were found and how each was resolved.
     e. Ask the user to confirm the resolutions look correct before proceeding.

### Step 7: Generate the production deploy report

```
## Production Deploy Report: staging → main

**Date:** <current date>
**Commits being deployed:** <count>

### Staging Health (Pre-Merge)

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

### Conflicts Resolved
<if any conflicts were resolved in Step 6, list them here>
<if no conflicts, omit this section>

### What Will Happen on Push
1. **GitHub Actions** will deploy CMS, SSE service, and bid-worker to **Railway production**
2. **Vercel** will auto-deploy frontend to **bidmo.to** (production)

### Potential Risks
<any concerns: breaking changes, DB migrations, env var changes needed, schema changes, security-sensitive changes>
<if DB migrations are included, WARN that they will auto-run on deploy>
```

### Step 8: Final confirmation — MANDATORY

**CRITICAL: You MUST stop here and wait for the user's explicit response. Do NOT proceed to Step 9 under any circumstances until the user replies.**

After showing the full report, ask the user:

> Everything above will be deployed to **PRODUCTION** (`bidmo.to`).
> This will trigger Railway backend deploys AND Vercel frontend deploy.
>
> **Do you want to proceed with the push to main? (yes/no)**

Then STOP. Do not run any git push command. Wait for the user to respond in a new message.

- If the user says **yes / y / go / push / do it / confirm** → proceed to Step 9.
- If the user says **no / n / stop / cancel / wait / not yet** or anything other than a clear yes → acknowledge and stop. Do not push.
- If the user asks to change something first → help them make the change, amend or add a commit, then re-run from Step 7.

### Step 9: Push to main

Only run this step AFTER the user has explicitly confirmed in Step 8.

1. Run `git push origin main`.
2. Show the push result.
3. Show the GitHub Actions status link: `https://github.com/ptchblckchocopie/Bidtomo/actions`
4. Tell the user:

```
### Deploy Triggered ✓

**Backend (Railway):** GitHub Actions workflow started
  - CMS: https://cms-production-d0f7.up.railway.app
  - SSE: https://sse-service-production-1d4e.up.railway.app

**Frontend (Vercel):** Auto-deploy triggered
  - Production: https://bidmo.to

Monitor the deploy:
  - GitHub Actions: https://github.com/ptchblckchocopie/Bidtomo/actions
  - Vercel dashboard: check Vercel project page

Backend deploys typically take 2-5 minutes. Frontend deploys typically take 1-2 minutes.
```

### Step 10: Post-deploy health check (optional)

After the user confirms deploys are complete (or after ~3 minutes), offer to run production health checks:

1. **CMS:** `curl -s --max-time 10 https://cms-production-d0f7.up.railway.app/api/health`
2. **SSE:** `curl -s --max-time 10 https://sse-service-production-1d4e.up.railway.app/health`
3. **Frontend:** `curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://bidmo.to/`

Report results in the same table format.

## Rules

- **NEVER push without the user's explicit "yes" in Step 8.** The confirmation is not rhetorical — always wait.
- **Never force push to main.** If a regular push fails, investigate why and report to the user.
- **Prefer staging version** in conflict resolution — staging is the tested code.
- Keep the summary human-readable — no raw diffs in the output, just the report.
- If conflict resolution changed any logic (not just whitespace/formatting), always ask the user to review before continuing.
- If ALL staging services are down, strongly recommend fixing staging before merging to production.
- Health checks should have a 10-second timeout — don't hang waiting for unresponsive services.
- After pushing, switch back to the `staging` branch: `git checkout staging` so the user continues working on staging.
