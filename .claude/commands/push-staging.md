# Push to Staging — Pre-Push Review

You are about to help the user push to the `staging` branch. Before pushing, generate a concise change report and ask for confirmation.

## Steps

1. **Gather info** — Run these commands to understand what will be pushed:
   - `git branch --show-current` to confirm the current branch
   - `git log origin/staging..HEAD --oneline` to see unpushed commits (if tracking staging), OR `git log origin/main..HEAD --oneline` to see commits ahead of main
   - `git diff origin/staging..HEAD --stat` to see changed files summary
   - `git diff origin/staging..HEAD` to see the actual diff (read it, don't dump it all to the user)

2. **Generate a concise report** with this format:

```
## Pre-Push Report: staging

**Branch:** <current branch>
**Commits to push:** <count>

### Commits
<list each commit: hash + message>

### Files Changed
<count> files changed, <insertions> insertions, <deletions> deletions

### Summary
<2-4 bullet points describing WHAT changed and WHY, grouped by feature/fix>

### Potential Risks
<any concerns: breaking changes, missing tests, schema changes, env var changes, security-sensitive files>
```

3. **Ask for confirmation** — After showing the report, ask:
   "Do you want to push these changes to `staging`? (This will trigger a Vercel preview deployment and CI/CD if configured.)"

4. **If confirmed** — Run `git push origin HEAD:staging` (pushes current branch to remote staging).
   - If the current branch IS `staging`, just run `git push origin staging`.
   - Show the push result.

5. **If declined** — Acknowledge and stop. Do not push.

## Rules
- If there are no unpushed commits, tell the user "Nothing to push — staging is up to date."
- If there are uncommitted changes, warn the user and ask if they want to commit first.
- Never force push unless the user explicitly asks.
- Keep the summary human-readable — no raw diffs in the output, just the report.
