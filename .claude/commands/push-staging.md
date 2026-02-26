# Push to Staging — Pre-Push Review

You are about to help the user push to the `staging` branch. Before pushing, resolve any conflicts, verify staging backend health, generate a concise change report, and ask for confirmation.

## Steps

### Step 1: Check for uncommitted changes

Run `git status --short`. If there are uncommitted changes, warn the user and ask if they want to commit first. Do not proceed until the working tree is clean or the user says to continue.

### Step 2: Sync with remote and resolve conflicts

1. Run `git fetch origin` to get the latest remote state.
2. Check if `origin/staging` has commits that the local branch doesn't:
   - Run `git log HEAD..origin/staging --oneline`
   - If there are incoming commits, a merge is needed.
3. If a merge is needed:
   - Run `git merge origin/staging`
   - If the merge succeeds cleanly, continue to the next step.
   - If there are **merge conflicts**:
     a. Run `git diff --name-only --diff-filter=U` to list conflicted files.
     b. For each conflicted file, read it, understand both sides of the conflict, and resolve it intelligently:
        - Prefer keeping both changes when they don't contradict.
        - If changes contradict, prefer the local (HEAD) version but explain why.
        - For config/generated files (package-lock.json, etc.), prefer the version that makes sense contextually.
     c. After resolving, stage the files with `git add <file>` and complete the merge with `git commit`.
     d. Show the user what conflicts were found and how each was resolved. Ask them to confirm the resolutions look correct before proceeding.
4. If no merge needed, continue.

### Step 3: Verify staging backend health

Before pushing, check that the staging backend services are healthy. Run these health checks **in parallel**:

1. **CMS Health:** `curl -s --max-time 10 https://cms-staging-v2.up.railway.app/api/health`
   - Expect JSON with `status: "ok"`.
   - Check `redis` field — should be `"connected"`.
   - Check `elasticsearch` field — note if `"disconnected"` (non-blocking but worth flagging).

2. **SSE Health:** `curl -s --max-time 10 https://sse-service-staging-v2.up.railway.app/health`
   - Expect JSON with `status: "ok"` or `"degraded"`.
   - Check `redis` field — should be `"connected"`.

Generate a health status table:

```
### Staging Backend Health

| Service | Status | Redis | Elasticsearch |
|---------|--------|-------|---------------|
| CMS     | ✓ OK / ✗ Down | ✓ / ✗ | ✓ / ✗ / N/A |
| SSE     | ✓ OK / ✗ Down | ✓ / ✗ | N/A |
```

- If **CMS is down**: STOP. Warn the user that pushing will trigger a Vercel deploy pointing at a broken CMS. Ask if they want to push anyway.
- If **Redis is disconnected**: WARN. Bids and real-time features won't work. Flag it but don't block.
- If **Elasticsearch is disconnected**: NOTE. Search will fall back to Payload queries. Non-blocking.
- If **SSE is down**: WARN. Real-time updates won't work. Flag it but don't block.
- If a health check **times out** (e.g. service sleeping): Note it as "Unreachable (may be sleeping)" — Railway free-tier services sleep after inactivity. Non-blocking.

### Step 4: Gather change info

Run these commands to understand what will be pushed:
- `git log origin/staging..HEAD --oneline` to see unpushed commits
- `git diff origin/staging..HEAD --stat` to see changed files summary
- `git diff origin/staging..HEAD` to read the actual diff (don't dump raw diff to user)

If there are no unpushed commits, tell the user "Nothing to push — staging is up to date." and stop.

### Step 5: Generate the report

```
## Pre-Push Report: staging

**Branch:** <current branch>
**Commits to push:** <count>

### Staging Backend Health

| Service | Status | Redis | Elasticsearch |
|---------|--------|-------|---------------|
| CMS     | ... | ... | ... |
| SSE     | ... | ... | ... |

### Commits
<list each commit: hash + message>

### Files Changed
<count> files changed, <insertions> insertions, <deletions> deletions

### Summary
<2-4 bullet points describing WHAT changed and WHY, grouped by feature/fix>

### Conflicts Resolved
<if any conflicts were resolved in Step 2, list them here with brief explanation>
<if no conflicts, omit this section>

### Potential Risks
<any concerns: breaking changes, missing tests, schema changes, env var changes, security-sensitive files, backend health issues>
```

### Step 6: Final confirmation — MANDATORY

**CRITICAL: You MUST stop here and wait for the user's explicit response. Do NOT proceed to Step 7 under any circumstances until the user replies.**

After showing the full report, ask the user:

> Everything above is what will be pushed to `staging`. This will trigger a Vercel preview deployment.
>
> **Do you want to proceed with the push? (yes/no)**

Then STOP. Do not run any git push command. Wait for the user to respond in a new message.

- If the user says **yes / y / go / push / do it / confirm** → proceed to Step 7.
- If the user says **no / n / stop / cancel / wait / not yet** or anything other than a clear yes → acknowledge and stop. Do not push.
- If the user asks to change something first → help them, then re-run the report from Step 4 before asking again.

### Step 7: Push

Only run this step AFTER the user has explicitly confirmed in Step 6.

- Run `git push origin staging` (if on staging branch) or `git push origin HEAD:staging` (if on another branch).
- Show the push result.

## Rules
- **NEVER push without the user's explicit "yes" in Step 6.** The confirmation question is not rhetorical — always wait for a reply.
- Never force push unless the user explicitly asks.
- Keep the summary human-readable — no raw diffs in the output, just the report.
- If conflict resolution changed any logic (not just whitespace/formatting), always ask the user to review before continuing.
- If ALL backend services are down, strongly recommend investigating before pushing.
- Health checks should have a 10-second timeout — don't hang waiting for unresponsive services.
