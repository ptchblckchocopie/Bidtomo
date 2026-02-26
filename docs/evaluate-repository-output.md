# Repository Evaluation: bidmo.to

**Date:** 2026-02-26
**Evaluator:** Claude Code (evaluate-repository command)

---

## 1. Code Quality — Score: 7/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `cms/src/server.ts` is ~2,135 lines — monolithic file with 20+ endpoints; should be decomposed | `cms/src/server.ts` |
| OPEN | JWT token extraction duplicated in 10+ endpoints instead of centralized | `cms/src/server.ts` (10+ locations) |
| OPEN | No unit/integration test runner — only k6 stress tests | repo-wide |

**Strengths:** Well-structured multi-service architecture, TypeScript throughout, strict mode in frontend, consistent bridge patterns (~33 routes), ES2020/Node 20.

## 2. Security & Safety — Score: 4/10

### Critical

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | Production DB credentials committed to git | `.claude/settings.local.json:55-63` |
| OPEN | Sentry auth token committed (file says "DO NOT commit") | `frontend/.env.sentry-build-plugin` |
| OPEN | Dev .env files tracked in git with PAYLOAD_SECRET and DB credentials | `cms/.env`, `.env.docker` |

### High

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | Overly permissive CORS — no-origin allowed; wildcard `*.up.railway.app` | `cms/src/server.ts:40` |
| OPEN | DB SSL bypass in production — `rejectUnauthorized: false` fallback | `cms/src/payload.config.ts` |
| OPEN | S3 ACL set to `public-read` — all uploads world-readable | `cms/src/payload.config.ts` |
| OPEN | Supabase project ID hardcoded as default endpoint | `cms/src/payload.config.ts` |

### Medium

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | Error messages leak to clients (`error.message` in 10+ endpoints) | `cms/src/server.ts` |
| OPEN | No rate limiting on any endpoint | repo-wide |
| OPEN | Redis and Elasticsearch connections have no auth by default | `cms/src/redis.ts`, `cms/src/services/elasticSearch.ts` |
| OPEN | `Math.random()` used for job IDs instead of `crypto.randomBytes()` | `cms/src/redis.ts` |

### Low

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No security headers (helmet, X-Frame-Options, CSP) | `cms/src/server.ts` |
| OPEN | `sendDefaultPii: true` in Sentry — GDPR concern | `frontend/src/hooks.client.ts` |
| OPEN | `{@html}` usage with hardcoded data — safe but bad pattern | `frontend/src/routes/about-us/+page.svelte:115` |

### Strengths

- No `eval()`, `exec()`, or `child_process` usage
- Server-side proxy pattern (bridge) prevents direct CMS access from browser
- JWT-based auth with proper token handling
- No SQL injection — Payload ORM provides parameterized queries

## 3. Documentation & Transparency — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No documentation of security posture or committed credential issues | repo-wide |
| OPEN | No security policy or threat model | repo-wide |

**Strengths:** Comprehensive CLAUDE.md, 9 slash commands, README/QUICKSTART/SETUP/AUTHENTICATION/DOCKER/PLANNING docs, `.env.example` templates.

## 4. Functionality & Scope — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No automated unit/integration tests | repo-wide |

**Strengths:** Full auction marketplace matching claims — bidding pipeline, JWT auth, messaging, transactions, void requests, ratings, Elasticsearch search, blue/green deployment, Docker Compose, CI/CD, k6 stress tests.

## 5. Repository Hygiene & Maintenance — Score: 5/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `.gitignore` incomplete — sensitive files tracked | `.gitignore` |
| OPEN | No LICENSE file | repo root |
| OPEN | PM2 ecosystem config contains hardcoded production credentials | `ecosystem.config.js` |
| OPEN | `settings.local.json` contains production DB passwords in allow-list | `.claude/settings.local.json` |
| OPEN | No CODEOWNERS, CONTRIBUTING, or PR templates | repo-wide |

**Strengths:** Clean git history with focused commits, current dependencies with no known CVEs.

---

## Claude-Code-Specific Checklist

| Item | Status | Notes |
|------|--------|-------|
| Defines hooks | No | — |
| Hooks execute shell scripts | N/A | — |
| Commands invoke shell/external tools | Yes | 9 markdown commands — documentation only, no shell execution |
| Writes persistent local state files | No | — |
| Reads state to control execution flow | No | — |
| Implicit execution without confirmation | Yes | `settings.local.json` pre-authorizes 64 bash patterns including `sudo`, production DB, `git push` |
| Documents hook/command side effects | Partial | Commands documented in CLAUDE.md; broad permission allowlist undocumented |
| Includes safe defaults | No | Permissions allowlist is extremely broad |
| Clear disable/cancel mechanism | Yes | Standard Claude Code permission system |

---

## Permissions & Side Effects Analysis

### A. Declared Permissions

- **File system:** Read/write within project directory
- **Network:** Dev servers (:5173, :3001, :3002), Docker
- **Execution:** Shell scripts for deployment
- **APIs:** Railway CLI, Vercel CLI, GitHub CLI

### B. Actual Permissions (from `settings.local.json`)

- **File system:** Full read/write + `chmod +x` (confirmed)
- **Network:** Unrestricted `curl:*`, Railway/Vercel MCP tools, WebSearch, production DB access (confirmed)
- **Execution:** `sudo systemctl:*`, `sudo npm:*`, `node:*`, `npx:*`, `python3:*` (confirmed)
- **APIs:** Vercel deploy, Railway create-environment/get-logs/list-services, Playwright (confirmed)

### C. Discrepancies

| Declared | Actual | Severity |
|----------|--------|----------|
| "Development commands" | Production DB credentials in permission entries | CRITICAL |
| Standard project scope | `sudo systemctl:*` and `sudo npm:*` allowed | HIGH |
| No mention of production access | Railway production deployable without confirmation | HIGH |
| Env var approach documented | Hardcoded credentials bypass it | MEDIUM |

---

## Red Flag Scan

| Check | Found | Notes |
|-------|-------|-------|
| Malware/spyware | No | — |
| Undisclosed implicit execution | Yes | 64 pre-authorized bash patterns undocumented |
| Undocumented file/network activity | Yes | Production DB credentials enable direct access |
| Unsupported claims | No | Features match claims |
| Supply-chain risks | Low | Well-known dependency publishers |

---

## Overall Assessment

### Overall Score: 5.5 / 10

### Recommendation: Needs further manual review

Well-architected auction marketplace with solid design patterns, but critical credential management failures undermine security posture.

---

## Remedies (Priority Order)

### Immediate

1. Rotate ALL exposed credentials (Railway DB passwords, Sentry token, Payload secrets)
2. Remove `settings.local.json` from git or redact credential-containing entries
3. Add to `.gitignore`: `.claude/settings.local.json`, `frontend/.env.sentry-build-plugin`, `cms/.env`, `.env.docker`
4. Scrub git history for committed secrets

### High Priority

5. Tighten CORS — remove no-origin allowance, restrict wildcard patterns
6. Require DB SSL certificates — remove `rejectUnauthorized: false`
7. Change S3 ACL to `private`; implement signed URLs
8. Scope Claude Code permissions — remove `sudo:*`, restrict `git push`
9. Add rate limiting (`express-rate-limit`)

### Medium Priority

10. Decompose `server.ts` into route modules
11. Centralize JWT extraction into `auth-helpers.ts`
12. Add security headers via `helmet`
13. Use `crypto.randomBytes()` for job IDs
14. Add automated unit/integration tests
15. Add LICENSE file

---

## Changelog

| Date | Score | Findings | Summary |
|------|-------|----------|---------|
| 2026-02-26 | 5.5/10 | 3 critical, 4 high, 4 medium, 3 low | First evaluation — no prior baseline |
