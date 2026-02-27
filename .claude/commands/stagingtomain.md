# Staging to Main — Production Pull Request

You are about to help the user create a Pull Request from `staging` into `main` for a production deployment. This will NOT merge or push — it creates a PR that the team reviews and merges manually via GitHub.

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

1. Run `git merge-tree $(git merge-base origin/main origin/staging) origin/main origin/staging` or do a dry-run merge to detect conflicts:
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

**Do NOT resolve the conflicts yourself.** Just report them. The team will handle resolution during the PR review.

### Step 5: Verify staging health (pre-PR sanity check)

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

### Step 6: Generate the report and create the PR

First, show the user this report:

```
## Production PR Report: staging → main

**Date:** <current date>
**Commits in PR:** <count>

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

### Step 7: Final confirmation — MANDATORY

**CRITICAL: You MUST stop here and wait for the user's explicit response. Do NOT create the PR under any circumstances until the user replies.**

After showing the full report, ask the user:

> This will create a Pull Request from `staging` → `main`. It will **NOT** merge or deploy anything — your team can review and merge it manually.
>
> **Do you want to create the PR? (yes/no)**

Then STOP. Do not run any gh command. Wait for the user to respond in a new message.

- If the user says **yes / y / go / create / do it / confirm** → proceed to Step 8.
- If the user says **no / n / stop / cancel / wait / not yet** or anything other than a clear yes → acknowledge and stop. Do not create the PR.
- If the user asks to change something first → help them make the change, then re-run from Step 3.

### Step 8: Create the Pull Request

Only run this step AFTER the user has explicitly confirmed in Step 7.

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
🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)"
```

After creating the PR, show the user:

```
### Pull Request Created ✓

**PR:** <PR URL>

**Next steps:**
1. Review the PR on GitHub with your team
2. When ready, merge via GitHub to trigger production deploy
3. After merge, deploys will trigger automatically:
   - Backend (Railway): https://github.com/ptchblckchocopie/Bidtomo/actions
   - Frontend (Vercel): auto-deploys to https://bidmo.to
```

## Rules

- **NEVER create the PR without the user's explicit "yes" in Step 7.** The confirmation is not rhetorical — always wait.
- **NEVER merge the PR yourself.** Only create it. The team merges manually.
- **NEVER push directly to main.** All production deploys go through PRs.
- **Do NOT resolve conflicts.** Report them with suggested fixes — the team handles resolution during PR review.
- Keep the summary human-readable — no raw diffs in the output, just the report.
- If ALL staging services are down, strongly recommend fixing staging before creating the PR.
- Health checks should have a 10-second timeout — don't hang waiting for unresponsive services.
- After creating the PR, stay on the `staging` branch so the user continues working on staging.
