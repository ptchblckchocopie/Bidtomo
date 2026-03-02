# Repository Evaluation: bidmo.to

**Date:** 2026-03-02
**Evaluator:** Claude Code (evaluate-repository command)

---

## 1. Code Quality & Architecture — Score: 7.5/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `cms/src/server.ts` is ~1,964 lines — monolithic file with 20+ endpoints; should be decomposed | `cms/src/server.ts` |
| RESOLVED | JWT token extraction duplicated in 10+ endpoints — now centralized via `requireAuth` middleware. 4 endpoints still use `authenticateJWT()` for admin-gated logic. | `cms/src/middleware/requireAuth.ts`, `cms/src/server.ts` |
| OPEN | No unit/integration test runner — only k6 stress tests | repo-wide |
| OPEN | 83 `any` type usages in `cms/src/server.ts` (up from 81 — 2 additional casts for second-bidder `FOR UPDATE` fix) | `cms/src/server.ts` |
| OPEN | 9 `(global as any)` casts in `payload.config.ts` for cross-module function sharing — fragile pattern | `cms/src/payload.config.ts` |
| OPEN | Dead code: `create-conversations-local.ts` and `sync-bids.js` reference MongoDB adapter — cannot work with PostgreSQL | `cms/src/create-conversations-local.ts:13`, `cms/sync-bids.js:12` |
| OPEN | Dead code: `cms/src/s3Adapter.ts` — orphaned custom S3 adapter, not imported anywhere | `cms/src/s3Adapter.ts` |
| OPEN | Dead code: 3 unused SvelteKit adapters installed (`adapter-auto`, `adapter-node`) — only `adapter-vercel` used | `frontend/package.json` |
| OPEN | Inconsistent error handling in `api.ts` — some functions rethrow (`createRating`, `updateProduct`), most return `null` | `frontend/src/lib/api.ts` |
| OPEN | 8 `console.log` statements in `api.ts` leak bid amounts/timing data to browser devtools in production | `frontend/src/lib/api.ts:609,637,652,661,741,755,764,1128` |
| OPEN | 3 debug `console.log` in bids access check leak user IDs/emails to server logs in production | `cms/src/payload.config.ts:661,667,671` |

**Strengths:** Well-structured multi-service architecture, TypeScript throughout, strict mode in frontend, consistent bridge patterns (33 routes), ES2020/Node 20, clean bid-worker with full row-level locking, `requireAuth` middleware centralizes JWT extraction, `validate()` middleware with Zod schemas on all POST endpoints, `authenticateJWT` helper in `auth-helpers.ts` for admin-gated endpoints. Fallback bid paths now use raw SQL with `FOR UPDATE` — mirrors bid-worker pattern.

## 2. Security & Safety — Score: 8.5/10

### Critical

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Production DB credentials scrubbed from git history via `git-filter-repo` — all 9 credential patterns replaced across 325 commits. PAYLOAD_SECRET rotated on all 4 Railway services (prod CMS, prod SSE, staging CMS, staging SSE). DB passwords and Sentry token still need manual rotation. | `.claude/settings.local.json` (git history), Railway dashboard |

### High

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Overly permissive CORS — hardcoded private IPs and server IP removed | `cms/src/server.ts:53-66` |
| OPEN | DB SSL bypass in production — `rejectUnauthorized: false` when `DATABASE_CA_CERT` not set (now with startup warning) | `cms/src/payload.config.ts:96-103` |
| OPEN | S3 ACL set to `public-read` — all uploads world-readable (acceptable for marketplace images) | `cms/src/payload.config.ts:28` |
| OPEN | Supabase project ID hardcoded as default S3 endpoint | `cms/src/payload.config.ts:24` |
| RESOLVED | Legacy SSE endpoint `/api/products/:id/stream` — removed (was no auth, no rate limit, no connection cap) | `cms/src/server.ts` |
| RESOLVED | No CI/CD test or type-check gate — type-check job now required before deploy in both workflows | `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-staging.yml` |
| RESOLVED | JWT secret inconsistency: SSE service and CMS inline code now all use SHA-256-hashed `PAYLOAD_SECRET` via `getPayloadJwtSecret()` or equivalent derivation | `cms/src/middleware/requireAuth.ts:8-14`, `services/sse-service/src/index.ts:16` |
| RESOLVED | Fallback bid path (Redis down) now uses `SELECT ... FOR UPDATE` row locking — prevents race condition when Redis is unavailable | `cms/src/server.ts:805-926` |
| RESOLVED | SSE service was missing `PAYLOAD_SECRET` env var on both production and staging — JWT verification was hashing empty string, silently failing user message notifications. Fixed during credential rotation. | Railway environment variables |

### Medium

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Error messages leak to clients — now guarded with `isProduction` check | `cms/src/server.ts` |
| RESOLVED | No rate limiting — `express-rate-limit` now applied to login (10/15min), registration (5/hr), bids (30/min) | `cms/src/server.ts:82-102` |
| OPEN | Redis and Elasticsearch connections have no auth by default | `cms/src/redis.ts`, `cms/src/services/elasticSearch.ts` |
| RESOLVED | `Math.random()` for job IDs in CMS redis.ts — replaced with `crypto.randomBytes()` | `cms/src/redis.ts:58` |
| RESOLVED | `Math.random()` for job IDs in bid-worker — replaced with `crypto.randomBytes()` | `services/bid-worker/src/index.ts:68` |
| RESOLVED | Media `update` access restricted to admin only (was `!!req.user`) | `cms/src/payload.config.ts:1274` |
| OPEN | `ratings` `access.update` returns `true` for all users, relying solely on `beforeChange` hook — misleading access function | `cms/src/payload.config.ts:1292-1296` |
| OPEN | Transaction status not re-validated at void approval time (checked at creation but not re-checked) | `cms/src/server.ts:1332` |
| RESOLVED | No input validation on POST bodies — Zod schemas now validate all custom CMS endpoints via `validate()` middleware | `cms/src/middleware/validate.ts`, `cms/src/server.ts` |

### Low

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | No security headers — helmet now installed and configured | `cms/src/server.ts:101-104` |
| RESOLVED | `sendDefaultPii: true` in Sentry — changed to `false` | `frontend/src/hooks.client.ts:14` |
| RESOLVED | Sentry auth token and sensitive files untracked from git via `git rm --cached` | `frontend/.env.sentry-build-plugin`, `.claude/settings.local.json`, `.env.docker` |
| OPEN | `{@html}` usage with hardcoded data — safe but bad pattern | `frontend/src/routes/about-us/+page.svelte:115` |
| OPEN | `/api/health` publicly accessible, leaks Redis/Elasticsearch connection topology | `cms/src/server.ts:1115-1123` |
| OPEN | CSRF protection allows requests with absent `Origin` header (mitigated by `SameSite=Strict` cookie) | `frontend/src/hooks.server.ts:24` |
| RESOLVED | `GET /api/typing/:productId` inconsistent auth — now uses `requireAuth` middleware like POST sibling | `cms/src/server.ts:1819` |
| OPEN | Bids collection fully public read — `censorName` only affects UI, bidder IDs visible in API | `cms/src/payload.config.ts:659` |

### Strengths

- No `eval()`, `exec()`, or `child_process` usage
- Server-side proxy pattern (bridge) prevents direct CMS access from browser
- JWT-based auth with proper token handling via `requireAuth` middleware and `authenticateJWT()` helper
- JWT secret consistently hashed (SHA-256) across ALL services — CMS, SSE service, and auth helpers
- No SQL injection — all SQL uses parameterized queries (bid-worker AND fallback paths)
- All data-modifying endpoints require authentication
- Zod input validation on all custom POST endpoints with structured error responses
- Comprehensive email template escaping with `escHtml()`
- Seller shill-bidding prevention in both CMS hooks, bid-worker, AND fallback bid path
- SSE user endpoint requires JWT token verification
- Per-IP connection limiting on SSE service (20/IP)
- Helmet security headers active
- Rate limiting on login, registration, and bid endpoints
- CI/CD type-check gates before deploy
- `/api/create-conversations` now admin-gated (previously unauthenticated)
- `/api/sync-bids` now admin-gated (previously unauthenticated)
- `.claude/settings.local.json` reduced to minimal permissions (single MCP tool)
- Fallback bid/accept paths use `FOR UPDATE` row locking — consistent with bid-worker

## 3. Financial & Auction Integrity — Score: 9/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Second bidder acceptance now uses `SELECT ... FOR UPDATE` on product row before setting status to `sold` — prevents concurrent accepts from creating duplicate transactions | `cms/src/server.ts:1703-1734` |
| OPEN | Transaction status not re-validated when void request is approved | `cms/src/server.ts:1332` |
| OPEN | `fetchMyPurchases()` N+1 query — 1 + N HTTP calls per page load | `frontend/src/lib/api.ts:790-826` |
| RESOLVED | Fallback direct bid creation (Redis-down path) now uses raw SQL with `SELECT ... FOR UPDATE` row-level locking — prevents concurrent bids from both succeeding | `cms/src/server.ts:805-926` |
| RESOLVED | Fallback accept bid (Redis-down path) now uses raw SQL with `SELECT ... FOR UPDATE` — prevents double-acceptance TOCTOU | `cms/src/server.ts:990-1090` |

**Strengths:**
- Bid-worker uses `SELECT ... FOR UPDATE` row locking — prevents double-winning
- **Fallback bid/accept paths now also use `FOR UPDATE` row locking** — all bid paths are race-condition safe regardless of Redis availability
- **Second bidder acceptance** now locks product row with `FOR UPDATE` before setting status to `sold` — prevents duplicate transactions from concurrent accepts
- Bid amount validation complete: `>= currentBid + bidInterval`, NaN/negative checks, Zod `z.number().positive().finite()` on input
- Auction end date enforced inside the locked transaction — race-condition safe
- Auction end 2-second buffer prevents bids that can't be processed in time (`server.ts:773`)
- Seller cannot bid on own product — checked in CMS `beforeValidate`, bid-worker SQL, AND fallback bid path
- Crash recovery via `pending_bids` PostgreSQL table — in-flight bids re-queued on restart
- Complete 5-endpoint void/dispute flow with cooldowns (1hr post-transaction, 5/user/24hr)
- Transaction status transitions properly guarded in `beforeChange` hook
- Fast-reject pre-check and batch deduplication optimize bid throughput under load

## 4. Real-Time System Reliability — Score: 8.5/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `UserSSEClient` and `GlobalSSEClient` have no polling fallback — give up after 20 reconnects | `frontend/src/lib/sse.ts:360-362,452-454` |
| OPEN | SSE service graceful shutdown does not close existing connections or send terminal event | `services/sse-service/src/index.ts:464-474` |
| RESOLVED | SSE service JWT verification now correctly uses SHA-256-hashed PAYLOAD_SECRET — matches Payload v2 signing | `services/sse-service/src/index.ts:13-16` |

**Strengths:**
- Exponential backoff with 25% jitter on all SSE clients (thundering herd prevention)
- `ProductSSEClient` has full polling fallback (5s interval) when SSE fails
- Redis channel names consistent across all services (`sse:product:{id}`, `sse:user:{id}`, `sse:global`)
- Per-IP connection limiting (20/IP) on SSE service
- Elasticsearch gracefully degrades — returns empty results, frontend falls back to Payload queries
- Redis failure triggers direct bid creation fallback in CMS (graceful degradation) — now with proper row-level locking
- Legacy in-process SSE removed — single SSE path via Redis pub/sub
- 15-second heartbeat prevents proxy/load-balancer timeout disconnections
- JWT verification consistent between CMS and SSE service

## 5. Documentation & Transparency — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No security policy or threat model | repo-wide |
| RESOLVED | CLAUDE.md says `getTokenFromRequest()` reads cookie first — actual code reads Authorization header first. CLAUDE.md now correctly documents the order. | `CLAUDE.md`, `frontend/src/lib/server/cms.ts:44-57` |
| OPEN | Tech-debt doc significantly stale — says "No rate limiting" (fixed), "No input validation" (fixed with Zod), and "JWT auth duplication" (partially addressed with `requireAuth`) | `.claude/commands/tech-debt.md:3,5,8` |

**Strengths:** Comprehensive CLAUDE.md with collections list, Redis channels, global functions, frontend key files, and complete endpoint documentation. 13 slash commands. README/QUICKSTART/SETUP/AUTHENTICATION/DOCKER/PLANNING docs. `.env.example` templates. Accurate architecture documentation.

## 6. Testing & Quality Assurance — Score: 4/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No automated unit/integration tests — zero test files | repo-wide |
| OPEN | No ESLint/Prettier configured | repo-wide |
| RESOLVED | CI/CD deploys without type-check — now has `tsc --noEmit` and `svelte-check` gates | `.github/workflows/deploy-production.yml`, `.github/workflows/deploy-staging.yml` |

**Strengths:** k6 stress test suite covers smoke, browse, auth, bids, full load, search, SSE, and bid-storm scenarios. `svelte-check` and `tsc` pass cleanly. CI/CD now enforces type-checking before deploy. Zod validation provides runtime type safety on all POST endpoints.

## 7. DevOps & Deployment — Score: 7/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | CI/CD has zero build/test/type-check gates — now has `type-check` job as required dependency | `.github/workflows/` |
| OPEN | Health endpoints exist but are not gated (public access to topology info) | `cms/src/server.ts:1115` |
| RESOLVED | `ecosystem.config.js` credentials — now uses `process.env` with safe defaults | `ecosystem.config.js` |

**Strengths:** Blue/green deployment via `deploy.sh`, Railway + Vercel split, health endpoints on CMS and SSE, database migrations version-controlled, PM2 process management, CI/CD type-check gates, nixpacks.toml for Railway builds.

## 8. Repository Hygiene & Maintenance — Score: 7/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | `.gitignore` updated — entries added for sensitive files | `.gitignore` |
| RESOLVED | Sensitive files untracked from git via `git rm --cached` | `.claude/settings.local.json`, `frontend/.env.sentry-build-plugin`, `.env.docker` |
| OPEN | No LICENSE file | repo root |
| RESOLVED | PM2 ecosystem config credentials removed | `ecosystem.config.js` |
| OPEN | No CODEOWNERS, CONTRIBUTING, or PR templates | repo-wide |
| OPEN | 3 dead/orphaned files should be removed | `cms/src/create-conversations-local.ts`, `cms/sync-bids.js`, `cms/src/s3Adapter.ts` |
| RESOLVED | `.claude/settings.local.json` reduced to minimal single MCP permission — major improvement from previous broad allowlist | `.claude/settings.local.json` |

**Strengths:** Clean git history with focused commits, current dependencies with no known CVEs, sensitive files properly untracked, good `.gitignore` coverage, minimal permissions in Claude Code settings.

---

## Claude-Code-Specific Checklist

| Item | Status | Notes |
|------|--------|-------|
| Defines hooks | No | — |
| Hooks execute shell scripts | N/A | — |
| Commands invoke shell/external tools | Yes | 13 markdown commands — documentation only, no shell execution |
| Writes persistent local state files | No | — |
| Reads state to control execution flow | No | — |
| Implicit execution without confirmation | Minimal | `settings.local.json` only pre-authorizes single MCP tool (`mcp__playwriter__execute`) |
| Documents hook/command side effects | Partial | Commands documented in CLAUDE.md; permission allowlist now minimal |
| Includes safe defaults | Yes | Minimal permissions, no broad wildcards |
| Clear disable/cancel mechanism | Yes | Standard Claude Code permission system |

---

## Permissions & Side Effects Analysis

### A. Declared Permissions

- **File system:** Read/write within project directory
- **Network:** Dev servers (:5173, :3001, :3002), Docker
- **Execution:** Shell scripts for deployment
- **APIs:** Railway CLI, Vercel CLI, GitHub CLI

### B. Actual Permissions (from `settings.local.json`)

- **File system:** Standard project access (confirmed)
- **Network:** Only `mcp__playwriter__execute` pre-authorized (confirmed)
- **Execution:** No elevated permissions — `sudo`, `curl:*` wildcards removed (confirmed)
- **APIs:** Playwright MCP tool only (confirmed)

### C. Discrepancies

| Declared | Actual | Severity |
|----------|--------|----------|
| "Development commands" | Production DB credentials scrubbed from git history; current file clean | RESOLVED |
| Standard project scope | Matches — no elevated permissions | NONE |

---

## Red Flag Scan

| Check | Found | Notes |
|-------|-------|-------|
| Hardcoded credentials in source | Resolved | `ecosystem.config.js` fixed; git history scrubbed via `git-filter-repo` (325 commits rewritten) |
| Unauthenticated data-modifying endpoints | Resolved | `/api/create-conversations` and `/api/sync-bids` now admin-gated |
| Missing rate limiting on auth/financial | Resolved | `express-rate-limit` on login, registration, bids |
| Unvalidated user input in DB queries | No | All SQL parameterized (bid-worker, fallback bid paths, fallback accept paths), Payload ORM for collections, Zod on all POST bodies |
| Overly permissive CORS | Resolved | Hardcoded IPs removed, no wildcards |
| Secrets in git history | Resolved | All 9 credential patterns scrubbed from git history via `git-filter-repo`. PAYLOAD_SECRET rotated. DB passwords and Sentry token still need manual rotation in provider dashboards. |
| `eval()` or dynamic code execution | No | — |
| Unbounded queries | Low risk | Payload default pagination, search capped at 50 results |
| Missing error handling on financial ops | No | Bid-worker has full try/catch with ROLLBACK; fallback paths have try/catch/ROLLBACK/finally(release) |
| Credential leakage in logs | Medium | 8 `console.log` in `api.ts` with bid data (browser-side), 3 debug logs in `payload.config.ts` leak user IDs/emails to server logs |
| Malware/spyware | No | — |
| Supply-chain risks | Low | Well-known dependency publishers |
| Unauthenticated SSE resource exhaustion | Resolved | Legacy endpoint removed; SSE service has per-IP limits |

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
| `crypto.randomBytes` for IDs | ✓ | N/A | N/A |
| JWT secret derivation (SHA-256 hash) | ✓ | ✓ | ✓ |
| `FOR UPDATE` locking on bid paths | ✓ | N/A | N/A |

---

## Overall Assessment

### Category Scores

| Category | Score | Weight | Change |
|----------|-------|--------|--------|
| Code Quality & Architecture | 7.5/10 | High | — |
| Security & Safety | 8.5/10 | Critical | +0.5 |
| Financial & Auction Integrity | 9/10 | Critical | +0.5 |
| Real-Time System Reliability | 8.5/10 | High | — |
| Documentation & Transparency | 8/10 | Medium | — |
| Testing & Quality Assurance | 4/10 | High | — |
| DevOps & Deployment | 7/10 | Medium | — |
| Repository Hygiene & Maintenance | 7/10 | Low | — |

### Weighted Overall Score: 7.6 / 10

### Recommendation: Production-ready with caveats

Well-architected auction marketplace with solid financial integrity and strong security posture. Since last evaluation: second-bidder acceptance race condition fixed with `FOR UPDATE` row lock, all credentials scrubbed from git history via `git-filter-repo` (325 commits rewritten), PAYLOAD_SECRET rotated on all 4 Railway services, and SSE service missing env var bug discovered and fixed. Zero critical issues remain.

**Key remaining risks:**
1. No automated unit/integration tests — regressions only caught by type-checking
2. Railway DB passwords and Sentry token still need manual rotation in provider dashboards
3. Transaction status not re-validated at void approval time
4. Tech-debt documentation increasingly stale (3+ items outdated)

---

## Remedies (Priority Order)

### Immediate

1. ~~**Rotate ALL exposed credentials**~~ — DONE: PAYLOAD_SECRET rotated, git history scrubbed. **Remaining:** Rotate Railway DB passwords and revoke Sentry auth token via provider dashboards (cannot be automated).

### High Priority

2. Add automated unit tests for bid-worker financial logic
3. Re-validate transaction status at void approval time

### Medium Priority

5. Decompose `server.ts` into route modules (bid routes, void routes, user routes, search routes)
6. Remove dead files (`create-conversations-local.ts`, `sync-bids.js`, `s3Adapter.ts`)
7. Remove debug `console.log` from bids access check (`payload.config.ts:661-671`) and `api.ts` (8 instances)
8. Update stale tech-debt documentation (rate limiting, input validation, JWT auth items)
9. Add `DATABASE_CA_CERT` to production to enable full TLS verification

---

## Changelog

| Date | Score | Findings | Summary |
|------|-------|----------|---------|
| 2026-02-26 | 5.5/10 | 3 critical, 4 high, 4 medium, 3 low | First evaluation — no prior baseline |
| 2026-02-27 | 6.5/10 | 3 critical, 3 high, 7 medium, 5 low | Security fixes: helmet added, CORS tightened, credentials removed from ecosystem.config.js, Math.random() fixed in CMS, sendDefaultPii disabled, .gitignore updated. 5 issues RESOLVED. New categories evaluated (Financial Integrity 8/10, Real-Time 8/10, Testing 3/10, DevOps 6/10). Files still tracked despite .gitignore — need git rm --cached. |
| 2026-02-27 | 7.0/10 | 1 critical, 2 high, 4 medium, 5 low | High-priority fixes: CI/CD type-check gates added, legacy SSE endpoint removed, Math.random() fixed in bid-worker, media update restricted to admin, sensitive files untracked via git rm --cached. 4 more issues RESOLVED (total 14 resolved across 3 rounds). Score improved from 5.5 → 7.0 across all evaluations. |
| 2026-03-02 | 7.1/10 | 1 critical, 3 high, 4 medium, 5 low | Maintenance round: CLAUDE.md documentation improved (+0.5 docs score), unauthenticated endpoints gated (create-conversations, sync-bids now admin-only), JWT hash fix in core auth paths, bridge auth hardened with SvelteKit cookies API, role validation fixed. 3 issues RESOLVED, 4 NEW issues found (JWT secret inconsistency across services, debug console.log in prod, fallback bid race condition, SSE JWT mismatch). |
| 2026-03-02 | 7.2/10 | 1 critical, 2 high, 3 medium, 4 low | Security hardening round: extracted `requireAuth` middleware centralizing JWT auth across endpoints, added Zod input validation schemas on all POST endpoints (`validate()` middleware), JWT secret now consistently SHA-256-hashed across all 3 services (RESOLVED), typing endpoint auth fixed (RESOLVED), settings.local.json reduced to minimal permissions. 5 issues RESOLVED (JWT inconsistency, SSE JWT mismatch, no input validation, typing auth, JWT duplication partially). Multi-service consistency fully green. |
| 2026-03-02 | 7.4/10 | 1 critical, 2 high, 3 medium, 4 low | Fallback bid race condition fix: both Redis-down fallback paths (bid queue and bid accept) now use raw SQL with `SELECT ... FOR UPDATE` row locking, matching bid-worker pattern. 2 financial/security issues RESOLVED. Security +0.5, Financial Integrity +0.5. All bid processing paths now race-condition safe. Remediation priority reordered (second-bidder acceptance now #3). |
| 2026-03-02 | 7.5/10 | 1 critical, 2 high, 3 medium, 4 low | Second-bidder acceptance race condition fix: `FOR UPDATE` row lock on product before setting status to `sold` prevents concurrent accepts from creating duplicate transactions. Financial Integrity 8.5→9.0. `any` count 81→83 (2 new casts for lock fix). |
| 2026-03-02 | 7.6/10 | 0 critical, 2 high, 3 medium, 4 low | Critical credential rotation: all 9 credential patterns scrubbed from git history via `git-filter-repo` (325 commits rewritten, force-pushed all branches). PAYLOAD_SECRET rotated on 4 Railway services. Discovered and fixed SSE service missing PAYLOAD_SECRET env var on both prod and staging (user notifications were silently failing). Security 8.0→8.5. Zero critical issues remain. |
