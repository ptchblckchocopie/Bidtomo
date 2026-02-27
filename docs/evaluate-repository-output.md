# Repository Evaluation: bidmo.to

**Date:** 2026-02-27
**Evaluator:** Claude Code (evaluate-repository command)

---

## 1. Code Quality & Architecture — Score: 7/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `cms/src/server.ts` is ~2,273 lines — monolithic file with 20+ endpoints; should be decomposed | `cms/src/server.ts` |
| OPEN | JWT token extraction duplicated in 10+ endpoints instead of centralized via middleware | `cms/src/server.ts` (10+ locations) |
| OPEN | No unit/integration test runner — only k6 stress tests | repo-wide |
| OPEN | 96 `any` type usages in `cms/src/server.ts` suppress type safety on DB return values | `cms/src/server.ts` |
| OPEN | 19+ `(global as any)` casts in `payload.config.ts` for cross-module function sharing — fragile pattern | `cms/src/payload.config.ts` |
| NEW | Dead code: `create-conversations-local.ts` and `sync-bids.js` reference MongoDB adapter — cannot work with PostgreSQL | `cms/src/create-conversations-local.ts:13`, `cms/sync-bids.js:12` |
| NEW | Dead code: `cms/src/s3Adapter.ts` — orphaned custom S3 adapter, not imported anywhere | `cms/src/s3Adapter.ts` |
| NEW | Dead code: 3 unused SvelteKit adapters installed (`adapter-auto`, `adapter-node`) — only `adapter-vercel` used | `frontend/package.json` |
| NEW | Inconsistent error handling in `api.ts` — some functions rethrow (`createRating`, `updateProduct`), most return `null` | `frontend/src/lib/api.ts` |
| NEW | 8 `console.log` statements in `api.ts` leak bid amounts/timing data to browser devtools in production | `frontend/src/lib/api.ts` |

**Strengths:** Well-structured multi-service architecture, TypeScript throughout, strict mode in frontend, consistent bridge patterns (33 routes), ES2020/Node 20, clean bid-worker with full row-level locking.

## 2. Security & Safety — Score: 6/10

### Critical

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | Production DB credentials exist in git history (commit `e4cac43`) — passwords must be rotated | `.claude/settings.local.json` (git history) |
| OPEN | Sentry auth token still tracked by git — `.gitignore` entry alone doesn't untrack | `frontend/.env.sentry-build-plugin` |
| OPEN | `.claude/settings.local.json` and `.env.docker` still tracked by git despite `.gitignore` entries — need `git rm --cached` | `.claude/settings.local.json`, `.env.docker` |

### High

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Overly permissive CORS — hardcoded private IPs and server IP removed | `cms/src/server.ts:19-30` |
| OPEN | DB SSL bypass in production — `rejectUnauthorized: false` when `DATABASE_CA_CERT` not set (now with startup warning) | `cms/src/payload.config.ts:100-103` |
| OPEN | S3 ACL set to `public-read` — all uploads world-readable (acceptable for marketplace images) | `cms/src/payload.config.ts:28` |
| OPEN | Supabase project ID hardcoded as default S3 endpoint | `cms/src/payload.config.ts:24` |
| NEW | Legacy SSE endpoint `/api/products/:id/stream` — no auth, no rate limit, no connection cap, resource exhaustion vector | `cms/src/server.ts:473` |
| NEW | No CI/CD test or type-check gate — both staging and production deploy on push with zero validation | `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-staging.yml` |

### Medium

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Error messages leak to clients — now guarded with `isProduction` check | `cms/src/server.ts` |
| RESOLVED | No rate limiting — `express-rate-limit` now applied to login (10/15min), registration (5/hr), bids (30/min) | `cms/src/server.ts:76-98` |
| OPEN | Redis and Elasticsearch connections have no auth by default | `cms/src/redis.ts`, `cms/src/services/elasticSearch.ts` |
| RESOLVED | `Math.random()` for job IDs in CMS redis.ts — replaced with `crypto.randomBytes()` | `cms/src/redis.ts:58` |
| NEW | `Math.random()` still used for job IDs in bid-worker (inconsistent with CMS fix) | `services/bid-worker/src/index.ts:67,360` |
| NEW | Media `update` access is `!!req.user` — any authenticated user can modify any media record metadata | `cms/src/payload.config.ts:1273` |
| NEW | `ratings` `access.update` returns `true` for all users, relying solely on `beforeChange` hook — misleading access function | `cms/src/payload.config.ts:1291-1295` |
| NEW | Transaction status not re-validated at void approval time (checked at creation but not re-checked) | `cms/src/server.ts:1332-1351` |

### Low

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | No security headers — helmet now installed and configured | `cms/src/server.ts:5,67-70` |
| RESOLVED | `sendDefaultPii: true` in Sentry — changed to `false` | `frontend/src/hooks.client.ts:14` |
| OPEN | `{@html}` usage with hardcoded data — safe but bad pattern | `frontend/src/routes/about-us/+page.svelte:115` |
| NEW | `/api/health` publicly accessible, leaks Redis/Elasticsearch connection topology | `cms/src/server.ts:981-989` |
| NEW | CSRF protection allows requests with absent `Origin` header (mitigated by `SameSite=Strict` cookie) | `frontend/src/hooks.server.ts:24` |
| NEW | `GET /api/typing/:productId` inconsistent auth — no JWT fallback unlike POST sibling | `cms/src/server.ts:1959` |
| NEW | Bids collection fully public read — `censorName` only affects UI, bidder IDs visible in API | `cms/src/payload.config.ts:658` |

### Strengths

- No `eval()`, `exec()`, or `child_process` usage
- Server-side proxy pattern (bridge) prevents direct CMS access from browser
- JWT-based auth with proper token handling
- No SQL injection — all bid-worker SQL uses parameterized queries
- All data-modifying endpoints require authentication
- Comprehensive email template escaping with `escHtml()`
- Seller shill-bidding prevention in both CMS hooks and bid-worker
- SSE user endpoint requires JWT token verification
- Per-IP connection limiting on SSE service (20/IP)

## 3. Financial & Auction Integrity — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| NEW | Second bidder acceptance creates new transaction without `FOR UPDATE` lock on product status | `cms/src/server.ts:1727-1737` |
| NEW | Transaction status not re-validated when void request is approved | `cms/src/server.ts:1332` |
| NEW | `fetchMyPurchases()` N+1 query — 1 + N HTTP calls per page load | `frontend/src/lib/api.ts:790-826` |

**Strengths:**
- Bid-worker uses `SELECT ... FOR UPDATE` row locking — prevents double-winning
- Bid amount validation complete: `>= currentBid + bidInterval`, NaN/negative checks, 10x cap
- Auction end date enforced inside the locked transaction — race-condition safe
- Seller cannot bid on own product — checked in both CMS `beforeValidate` and bid-worker SQL
- Crash recovery via `pending_bids` PostgreSQL table — in-flight bids re-queued on restart
- Complete 5-endpoint void/dispute flow with cooldowns (1hr post-transaction, 5/user/24hr)
- Transaction status transitions properly guarded in `beforeChange` hook

## 4. Real-Time System Reliability — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| NEW | `UserSSEClient` and `GlobalSSEClient` have no polling fallback — give up after 20 reconnects | `frontend/src/lib/sse.ts:346-348,437-440` |
| NEW | SSE service graceful shutdown does not close existing connections or send terminal event | `services/sse-service/src/index.ts:455-465` |

**Strengths:**
- Exponential backoff with 25% jitter on all SSE clients (thundering herd prevention)
- `ProductSSEClient` has full polling fallback (5s interval) when SSE fails
- Redis channel names consistent across all services (`sse:product:{id}`, `sse:user:{id}`, `sse:global`)
- Per-IP connection limiting (20/IP) on SSE service
- Elasticsearch gracefully degrades — returns empty results, frontend falls back to Payload queries
- Redis failure triggers direct bid creation fallback in CMS (graceful degradation)

## 5. Documentation & Transparency — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No security policy or threat model | repo-wide |
| NEW | CLAUDE.md says `getTokenFromRequest()` reads cookie first — actual code reads Authorization header first | `frontend/src/lib/server/cms.ts:44-57` vs CLAUDE.md |
| NEW | Tech-debt doc says "No rate limiting" — stale, rate limiting exists since commit `261e54b` | `.claude/commands/tech-debt.md` |

**Strengths:** Comprehensive CLAUDE.md, 10 slash commands, README/QUICKSTART/SETUP/AUTHENTICATION/DOCKER/PLANNING docs, `.env.example` templates, accurate Redis key/channel documentation.

## 6. Testing & Quality Assurance — Score: 3/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No automated unit/integration tests — zero test files | repo-wide |
| OPEN | No ESLint/Prettier configured | repo-wide |
| NEW | CI/CD deploys to production without any test or type-check step | `.github/workflows/deploy-production.yml` |

**Strengths:** k6 stress test suite covers smoke, browse, auth, bids, full load, search, SSE, and bid-storm scenarios. `svelte-check` and `tsc` pass cleanly.

## 7. DevOps & Deployment — Score: 6/10

| Status | Issue | Location |
|--------|-------|----------|
| NEW | CI/CD has zero build/test/type-check gates before deploy (both staging and production) | `.github/workflows/` |
| OPEN | Health endpoints exist but are not gated (public access to topology info) | `cms/src/server.ts:981` |
| RESOLVED | `ecosystem.config.js` credentials — now uses `process.env` with safe defaults | `ecosystem.config.js` |

**Strengths:** Blue/green deployment via `deploy.sh`, Railway + Vercel split, health endpoints on CMS and SSE, database migrations version-controlled, PM2 process management.

## 8. Repository Hygiene & Maintenance — Score: 6/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | `.gitignore` updated — entries added for sensitive files | `.gitignore` |
| OPEN | Files still tracked despite `.gitignore` — need `git rm --cached` for 3 files | `.claude/settings.local.json`, `frontend/.env.sentry-build-plugin`, `.env.docker` |
| OPEN | No LICENSE file | repo root |
| RESOLVED | PM2 ecosystem config credentials removed | `ecosystem.config.js` |
| OPEN | No CODEOWNERS, CONTRIBUTING, or PR templates | repo-wide |
| NEW | 4 dead/orphaned files should be removed | `cms/src/create-conversations-local.ts`, `cms/sync-bids.js`, `cms/src/s3Adapter.ts` |

**Strengths:** Clean git history with focused commits, current dependencies with no known CVEs.

---

## Claude-Code-Specific Checklist

| Item | Status | Notes |
|------|--------|-------|
| Defines hooks | No | — |
| Hooks execute shell scripts | N/A | — |
| Commands invoke shell/external tools | Yes | 10 markdown commands — documentation only, no shell execution |
| Writes persistent local state files | No | — |
| Reads state to control execution flow | No | — |
| Implicit execution without confirmation | Yes | `settings.local.json` pre-authorizes 68 bash patterns including `sudo`, production DB, `git push` |
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
| "Development commands" | Production DB credentials in permission entries (in git history) | CRITICAL |
| Standard project scope | `sudo systemctl:*` and `sudo npm:*` allowed | HIGH |
| No mention of production access | Railway production deployable without confirmation | HIGH |
| Env var approach documented | Hardcoded credentials in git history bypass it | MEDIUM |

---

## Red Flag Scan

| Check | Found | Notes |
|-------|-------|-------|
| Hardcoded credentials in source | Resolved in code, still in git history | `ecosystem.config.js` fixed; history not scrubbed |
| Unauthenticated data-modifying endpoints | No | All POST/PUT/PATCH/DELETE require auth |
| Missing rate limiting on auth/financial | Resolved | `express-rate-limit` on login, registration, bids |
| Unvalidated user input in DB queries | No | All SQL parameterized, Payload ORM for collections |
| Overly permissive CORS | Resolved | Hardcoded IPs removed, no wildcards |
| Secrets in git history | Yes | DB passwords and Sentry token recoverable via `git log` |
| `eval()` or dynamic code execution | No | — |
| Unbounded queries | Low risk | Payload default pagination, search capped at 50 results |
| Missing error handling on financial ops | No | Bid-worker has full try/catch with ROLLBACK |
| Credential leakage in logs | Low | 8 `console.log` in `api.ts` with bid data (browser-side only) |
| Malware/spyware | No | — |
| Supply-chain risks | Low | Well-known dependency publishers |

---

## Multi-Service Consistency Checklist

| Check | CMS ↔ Bid Worker | CMS ↔ SSE Service | CMS ↔ Frontend Bridge |
|-------|:-:|:-:|:-:|
| Redis channel names match | ✓ | ✓ | N/A |
| JWT token format handled identically | ✓ | ✓ | ✓ |
| Error response shapes consistent | ✓ | ✓ | ✓ |
| Product status enum values aligned | ✓ | ✓ | ✓ |
| Bid amount types (number) consistent | ✓ | N/A | ✓ |
| Environment variable names aligned | ✓ | ✓ | ✓ |

---

## Overall Assessment

### Category Scores

| Category | Score | Weight | Change |
|----------|-------|--------|--------|
| Code Quality & Architecture | 7/10 | High | — |
| Security & Safety | 6/10 | Critical | +2 |
| Financial & Auction Integrity | 8/10 | Critical | NEW |
| Real-Time System Reliability | 8/10 | High | NEW |
| Documentation & Transparency | 8/10 | Medium | — |
| Testing & Quality Assurance | 3/10 | High | NEW |
| DevOps & Deployment | 6/10 | Medium | NEW |
| Repository Hygiene & Maintenance | 6/10 | Low | +1 |

### Weighted Overall Score: 6.5 / 10

### Recommendation: Production-ready with caveats

Well-architected auction marketplace with solid financial integrity (bid-worker locking, comprehensive validation, crash recovery). Security posture improved significantly (helmet, rate limiting, CORS tightening, credential removal from config). Remaining critical items are credential rotation and git history scrubbing — operational tasks, not code issues. The lack of CI/CD test gates and zero automated tests are the biggest risks for regression.

---

## Remedies (Priority Order)

### Immediate

1. Run `git rm --cached .claude/settings.local.json frontend/.env.sentry-build-plugin .env.docker` to stop tracking these files
2. Rotate ALL exposed credentials (Railway DB passwords from git history, Sentry token, S3 keys)
3. Scrub git history with `git filter-repo` for committed secrets

### High Priority

4. Add type-check step (`tsc --noEmit`, `svelte-check`) to CI/CD before deploy
5. Remove or disable legacy SSE endpoint `/api/products/:id/stream` (replaced by SSE service)
6. Fix `Math.random()` in bid-worker to match CMS fix (`crypto.randomBytes`)
7. Restrict media `update` access to owner only

### Medium Priority

8. Decompose `server.ts` into route modules
9. Centralize JWT extraction into Express middleware
10. Add automated unit tests for bid-worker financial logic
11. Remove dead files (`create-conversations-local.ts`, `sync-bids.js`, `s3Adapter.ts`)
12. Add LICENSE file
13. Re-validate transaction status at void approval time

---

## Changelog

| Date | Score | Findings | Summary |
|------|-------|----------|---------|
| 2026-02-26 | 5.5/10 | 3 critical, 4 high, 4 medium, 3 low | First evaluation — no prior baseline |
| 2026-02-27 | 6.5/10 | 3 critical, 3 high, 7 medium, 5 low | Security fixes: helmet added, CORS tightened, credentials removed from ecosystem.config.js, Math.random() fixed in CMS, sendDefaultPii disabled, .gitignore updated. 5 issues RESOLVED. New categories evaluated (Financial Integrity 8/10, Real-Time 8/10, Testing 3/10, DevOps 6/10). Files still tracked despite .gitignore — need git rm --cached. |
