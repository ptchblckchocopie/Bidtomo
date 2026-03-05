# Repository Evaluation: bidmo.to

**Date:** 2026-03-04
**Evaluator:** Claude Code (evaluate-repository command)

---

## 1. Code Quality & Architecture — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | `cms/src/server.ts` was ~2,519 lines monolithic — now decomposed into 10 route modules under `cms/src/routes/`. Server.ts reduced to ~216 lines (startup, CORS, middleware, route registration) | `cms/src/server.ts`, `cms/src/routes/*.ts` |
| RESOLVED | JWT token extraction duplicated in 10+ endpoints — now centralized via `requireAuth` middleware. 4 endpoints still use `authenticateJWT()` for admin-gated logic. | `cms/src/middleware/requireAuth.ts` |
| OPEN | No unit/integration test runner — only k6 stress tests | repo-wide |
| OPEN | 94 `as any` type casts across CMS core: 8 in `server.ts`, 28 in `payload.config.ts`, 58 across route modules (largest: `voidRequests.ts` 19, `bids.ts` 10, `users.ts` 10) | `cms/src/server.ts`, `cms/src/payload.config.ts`, `cms/src/routes/*.ts` |
| OPEN | 15 `(global as any)` casts in `payload.config.ts` for cross-module function sharing — fragile pattern (up from 9) | `cms/src/payload.config.ts` |
| OPEN | Dead code: `create-conversations-local.ts` and `sync-bids.js` reference MongoDB adapter — cannot work with PostgreSQL | `cms/src/create-conversations-local.ts`, `cms/sync-bids.js` |
| OPEN | Dead code: `cms/src/s3Adapter.ts` — orphaned custom S3 adapter, not imported anywhere | `cms/src/s3Adapter.ts` |
| OPEN | Dead code: 3 unused SvelteKit adapters installed (`adapter-auto`, `adapter-node`) — only `adapter-vercel` used | `frontend/package.json` |
| OPEN | Inconsistent error handling in `api.ts` — some functions rethrow (`createRating`, `updateProduct`), most return `null` | `frontend/src/lib/api.ts` |
| OPEN | 8 `console.log` statements in `api.ts` leak product/bid data to browser devtools in production | `frontend/src/lib/api.ts:627,656,671,680,765,779,788,1152` |
| OPEN | 3 debug `console.log` in bids access check leak user IDs/emails to server logs in production | `cms/src/payload.config.ts:731,737,741` |
| RESOLVED | `zod` dependency was missing from `cms/package.json` — fixed | `cms/package.json` |
| RESOLVED | `server.ts` startup migration block — now extracted to `cms/src/migrations/preInit.ts` and `postInit.ts` | `cms/src/migrations/` |

**Strengths:** Well-structured multi-service architecture with clean route decomposition (10 modules). TypeScript throughout, strict mode in frontend, consistent bridge patterns (33+ routes), ES2020/Node 20. Clean bid-worker with full row-level locking. `requireAuth` middleware centralizes JWT extraction. `validate()` middleware with Zod schemas on POST endpoints. All route modules consistently use auth/validation where appropriate. Migrations properly separated into pre-init and post-init phases. Sentry backend integration with PII stripping.

## 2. Security & Safety — Score: 8.5/10

### Critical

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Production DB credentials scrubbed from git history via `git-filter-repo` | Railway dashboard |
| RESOLVED | `.claude/settings.local.json` cleaned — reduced from 60+ broad Bash wildcards with hardcoded DB credentials to 8 read-only MCP tool permissions only (WebSearch, Vercel docs, Railway/Vercel list, Railway logs) | `.claude/settings.local.json` |

### High

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Overly permissive CORS — hardcoded private IPs and server IP removed | `cms/src/server.ts:33-46` |
| OPEN | DB SSL bypass in production — `rejectUnauthorized: false` when `DATABASE_CA_CERT` not set (now with startup warning) | `cms/src/payload.config.ts:96-103` |
| OPEN | S3 ACL set to `public-read` — all uploads world-readable (acceptable for marketplace images) | `cms/src/payload.config.ts:29` |
| OPEN | Supabase project ID hardcoded as default S3 endpoint | `cms/src/payload.config.ts:25` |
| RESOLVED | Legacy SSE endpoint `/api/products/:id/stream` — removed | N/A |
| RESOLVED | No CI/CD test or type-check gate — type-check job now required before deploy | `.github/workflows/` |
| RESOLVED | JWT secret inconsistency across services — now all use SHA-256-hashed `PAYLOAD_SECRET` | `cms/src/middleware/requireAuth.ts`, `services/sse-service/src/index.ts:17` |
| RESOLVED | Fallback bid path (Redis down) now uses `SELECT ... FOR UPDATE` row locking | `cms/src/routes/bids.ts` |
| RESOLVED | SSE service was missing `PAYLOAD_SECRET` env var on both production and staging | Railway environment variables |
| OPEN | SSE service CORS allows any `*.vercel.app` subdomain — an attacker with a Vercel deployment could connect to SSE endpoints and monitor product/global events | `services/sse-service/src/index.ts:95` |
| OPEN | Backup SQL dumps stored in same S3 bucket as public media (`bidmo-media/backups/`) — if bucket has `public-read` ACL, backup files containing all user PII, messages, and financial data may be publicly accessible | `cms/src/services/backupService.ts:67-73` |

### Medium

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Error messages leak to clients — now guarded with `isProduction` check | `cms/src/routes/*.ts` |
| RESOLVED | No rate limiting — now applied to login, registration, bids, analytics, reports, dashboard | `cms/src/limiters.ts`, `cms/src/server.ts:91-96` |
| OPEN | Redis and Elasticsearch connections have no auth by default | `cms/src/redis.ts`, `cms/src/services/elasticSearch.ts` |
| RESOLVED | `Math.random()` for job IDs — replaced with `crypto.randomBytes()` | `cms/src/redis.ts`, `services/bid-worker/src/index.ts:69` |
| RESOLVED | Media `update` access restricted to admin only | `cms/src/payload.config.ts` |
| OPEN | `ratings` `access.update` returns `true` for all authenticated users, relying solely on `beforeChange` hook — misleading access function | `cms/src/payload.config.ts` |
| OPEN | Transaction status not re-validated at void approval time (checked at creation but not re-checked when another party approves) | `cms/src/routes/voidRequests.ts:147-151` |
| RESOLVED | No input validation on POST bodies — Zod schemas now validate custom CMS endpoints | `cms/src/middleware/validate.ts` |
| OPEN | Analytics dashboard `from`/`to` query params have regex for YYYY-MM-DD but don't reject arbitrary strings — malformed input passed to PostgreSQL causes 500 | `cms/src/routes/analytics.ts:91-95` |

### Low

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | No security headers — helmet now installed and configured | `cms/src/server.ts:81-85` |
| RESOLVED | `sendDefaultPii: true` in Sentry — changed to `false` | `frontend/src/hooks.client.ts` |
| RESOLVED | Sentry auth token and sensitive files untracked from git | various |
| OPEN | `{@html}` usage with hardcoded data — safe but bad pattern | `frontend/src/routes/about-us/+page.svelte:115` |
| OPEN | `/api/health` publicly accessible, leaks Redis/Elasticsearch connection topology | `cms/src/routes/health.ts` |
| OPEN | CSRF protection allows requests with absent `Origin` header (mitigated by `SameSite=Strict` cookie) | `frontend/src/hooks.server.ts:24` |
| RESOLVED | `GET /api/typing/:productId` inconsistent auth — now uses `requireAuth` | `cms/src/routes/typing.ts` |
| OPEN | Bids collection fully public read — `censorName` only affects UI, bidder IDs visible in API | `cms/src/payload.config.ts` |

### Strengths

- No `eval()`, `exec()`, or `child_process` usage
- Server-side proxy pattern (bridge) prevents direct CMS access from browser
- JWT-based auth with proper token handling via `requireAuth` middleware and `authenticateJWT()` helper
- JWT secret consistently hashed (SHA-256) across ALL services — CMS, SSE service, and auth helpers
- No SQL injection — all SQL uses parameterized queries (bid-worker, fallback paths, AND analytics queries)
- All data-modifying endpoints require authentication
- Zod input validation on all custom POST endpoints with structured error responses
- Comprehensive email template escaping with `escHtml()`
- Seller shill-bidding prevention in CMS hooks, bid-worker, AND fallback bid path
- SSE user endpoint requires JWT token verification
- Per-IP connection limiting on SSE service (20/IP)
- Helmet security headers active
- Rate limiting on login, registration, bids, analytics, reports, and analytics dashboard
- CI/CD type-check gates before deploy
- `/api/create-conversations` and `/api/sync-bids` now admin-gated
- Fallback bid/accept paths use `FOR UPDATE` row locking — consistent with bid-worker
- Sentry backend PII stripping in `beforeSend` — no email/IP/username sent to Sentry
- Reports collection: auth + rate limiting + Zod validation + deduplication
- Watchlist collection: row-level access control (user sees own only)
- Backup endpoint admin-gated, scheduler opt-in via `BACKUP_ENABLED`
- `.claude/settings.local.json` cleaned to minimal read-only permissions — no credentials, no Bash wildcards

## 3. Financial & Auction Integrity — Score: 9/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Second bidder acceptance now uses `SELECT ... FOR UPDATE` on product row before setting status to `sold` | `cms/src/routes/voidRequests.ts:502-508` |
| OPEN | Transaction status not re-validated when void request is approved — void request respond endpoint checks void request status but not linked transaction's current status | `cms/src/routes/voidRequests.ts:147-151` |
| OPEN | `fetchMyPurchases()` N+1 query — 1 + N HTTP calls per page load (up to 102 sequential requests for 100 products) | `frontend/src/lib/api.ts:820-856` |
| RESOLVED | Fallback direct bid creation (Redis-down path) now uses `FOR UPDATE` row-level locking | `cms/src/routes/bids.ts:90-92` |
| RESOLVED | Fallback accept bid (Redis-down path) now uses `FOR UPDATE` | `cms/src/routes/bids.ts:274-276` |

**Strengths:**
- Bid-worker uses `SELECT ... FOR UPDATE` row locking — prevents double-winning
- **All bid/accept paths use `FOR UPDATE` row locking** — race-condition safe regardless of Redis availability
- **Second bidder acceptance** locks product row with `FOR UPDATE` before setting status to `sold`
- Bid amount validation complete: `>= currentBid + bidInterval`, NaN/negative checks, Zod `z.number().positive().finite()` on input
- Auction end date enforced inside the locked transaction — race-condition safe
- Auction end 2-second buffer prevents bids that can't be processed in time
- Seller cannot bid on own product — checked in CMS `beforeValidate`, bid-worker SQL, AND fallback bid path
- Crash recovery via `pending_bids` PostgreSQL table — in-flight bids re-queued on restart
- Complete 5-endpoint void/dispute flow with cooldowns (1hr post-transaction, 5/user/24hr)
- Transaction status transitions properly guarded in `beforeChange` hook
- Fast-reject pre-check and batch deduplication optimize bid throughput under load

## 4. Real-Time System Reliability — Score: 8.5/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `UserSSEClient` and `GlobalSSEClient` have no polling fallback — give up after 20 reconnects | `frontend/src/lib/sse.ts:360-362,452-454` |
| OPEN | SSE service graceful shutdown does not close existing connections or send terminal event | `services/sse-service/src/index.ts:472-477` |
| RESOLVED | SSE service JWT verification now correctly uses SHA-256-hashed PAYLOAD_SECRET | `services/sse-service/src/index.ts:17` |

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
| RESOLVED | CLAUDE.md token extraction order now correctly documented | `CLAUDE.md` |
| OPEN | Tech-debt doc significantly stale — says "No rate limiting" (fixed), "No input validation" (fixed with Zod), "40+ any casts" (now 94), and "JWT auth duplication" (addressed with `requireAuth`) | `.claude/commands/tech-debt.md` |
| RESOLVED | CLAUDE.md now documents route architecture with all 10 modules listed, rate limiting section with all limiters, and updated key file references | `CLAUDE.md` |
| RESOLVED | CMS route endpoints now documented in CLAUDE.md under "CMS Route Architecture" section | `CLAUDE.md` |

**Strengths:** Comprehensive CLAUDE.md with collections list, Redis channels, global functions, frontend key files, route module listing, rate limiting documentation, and endpoint documentation. 13 slash commands. README/QUICKSTART/SETUP/AUTHENTICATION/DOCKER/PLANNING docs. `.env.example` templates. Architecture documentation accurate and up-to-date. Route architecture section properly documents all 10 modules with their endpoints.

## 6. Testing & Quality Assurance — Score: 4/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No automated unit/integration tests — zero test files | repo-wide |
| OPEN | No ESLint/Prettier configured | repo-wide |
| RESOLVED | CI/CD now has `tsc --noEmit` and `svelte-check` gates | `.github/workflows/` |
| RESOLVED | `zod` was missing from `cms/package.json` — fixed | `cms/package.json` |

**Strengths:** k6 stress test suite covers smoke, browse, auth, bids, full load, search, SSE, and bid-storm scenarios. `svelte-check` and `tsc` pass cleanly. CI/CD enforces type-checking before deploy. Zod validation provides runtime type safety on POST endpoints.

## 7. DevOps & Deployment — Score: 7/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | CI/CD has `type-check` job as required dependency before deploy | `.github/workflows/` |
| OPEN | Health endpoints exist but are not gated (public access to topology info) | `cms/src/routes/health.ts` |
| RESOLVED | `ecosystem.config.js` credentials — now uses `process.env` with safe defaults | `ecosystem.config.js` |
| OPEN | Automated backup scheduler added (opt-in via `BACKUP_ENABLED`) — good operational maturity but no integrity verification or restore testing | `cms/src/services/backupService.ts` |

**Strengths:** Blue/green deployment via `deploy.sh`, Railway + Vercel split, health endpoints on CMS and SSE, database migrations version-controlled with proper pre-init/post-init separation, PM2 process management, CI/CD type-check gates, nixpacks.toml for Railway builds. Automated backup scheduler with S3 upload and retention cleanup. Sentry error tracking on all 3 backend services.

## 8. Repository Hygiene & Maintenance — Score: 7.5/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | `.gitignore` updated — entries added for sensitive files | `.gitignore` |
| RESOLVED | Sensitive files untracked from git via `git rm --cached` | various |
| OPEN | No LICENSE file | repo root |
| RESOLVED | PM2 ecosystem config credentials removed | `ecosystem.config.js` |
| OPEN | No CODEOWNERS, CONTRIBUTING, or PR templates | repo-wide |
| OPEN | 3 dead/orphaned files should be removed | `cms/src/create-conversations-local.ts`, `cms/sync-bids.js`, `cms/src/s3Adapter.ts` |
| RESOLVED | `.claude/settings.local.json` cleaned to minimal read-only MCP permissions — no credentials, no Bash wildcards | `.claude/settings.local.json` |

**Strengths:** Clean git history with focused commits, good `.gitignore` coverage, `.claude/settings.local.json` is gitignored and now properly minimal. Active development velocity (30 commits in recent history covering reports, watchlist, categories, analytics, backup, migration fixes, route decomposition).

---

## Claude-Code-Specific Checklist

| Item | Status | Notes |
|------|--------|-------|
| Defines hooks | No | — |
| Hooks execute shell scripts | N/A | — |
| Commands invoke shell/external tools | Yes | 13 markdown commands — documentation only, no shell execution |
| Writes persistent local state files | No | — |
| Reads state to control execution flow | No | — |
| Implicit execution without confirmation | **Low** | `settings.local.json` pre-authorizes only 8 read-only MCP tools (WebSearch, list/view operations) |
| Documents hook/command side effects | Yes | Commands documented in CLAUDE.md; permissions are minimal and self-documenting |
| Includes safe defaults | **Yes** | Minimal read-only permissions, no Bash wildcards, no credentials |
| Clear disable/cancel mechanism | Yes | Standard Claude Code permission system |

---

## Permissions & Side Effects Analysis

### A. Declared Permissions

- **File system:** Read/write within project directory
- **Network:** Dev servers (:5173, :3001, :3002), Docker
- **Execution:** Shell scripts for deployment
- **APIs:** Railway CLI, Vercel CLI, GitHub CLI

### B. Actual Permissions (from `settings.local.json`)

- **File system:** Standard project access only — **confirmed appropriate**
- **Network:** `WebSearch`, `mcp__vercel__search_vercel_documentation`, `mcp__railway-mcp-server__get-logs` — **read-only**
- **Execution:** No Bash wildcards, no sudo, no elevated privileges — **confirmed safe**
- **APIs:** Vercel (docs search, list teams/projects only), Railway (status check, list projects/services, get logs only) — **read-only, no deploy access**
- **Credentials:** None — **confirmed clean**

### C. Discrepancies

| Declared | Actual | Severity |
|----------|--------|----------|
| Standard project scope | 8 read-only MCP tool permissions | **None** — appropriate |
| No credentials in source | Confirmed — no credentials in `settings.local.json` | **Resolved** |
| Minimal MCP permissions | Read-only Vercel/Railway list + logs only (no deploy, no variables) | **None** — safe |

---

## Red Flag Scan

| Check | Found | Notes |
|-------|-------|-------|
| Hardcoded credentials in source | **No** | `settings.local.json` cleaned — no credentials |
| Unauthenticated data-modifying endpoints | Resolved | `/api/create-conversations` and `/api/sync-bids` now admin-gated |
| Missing rate limiting on auth/financial | Resolved | `express-rate-limit` on login, registration, bids, analytics, reports, dashboard |
| Unvalidated user input in DB queries | No | All SQL parameterized, Zod on POST bodies |
| Overly permissive CORS | Partial | CMS CORS clean. SSE service allows any `*.vercel.app` subdomain. |
| Secrets in git history | Resolved | Scrubbed via `git-filter-repo` |
| `eval()` or dynamic code execution | No | — |
| Unbounded queries | Low risk | Payload default pagination, search capped at 50 results |
| Missing error handling on financial ops | No | Full try/catch/ROLLBACK on all paths |
| Credential leakage in logs | Medium | 8 `console.log` in `api.ts` with product/bid data; 3 debug logs in `payload.config.ts:731,737,741` with user emails |
| Malware/spyware | No | — |
| Supply-chain risks | Low | Well-known dependency publishers |
| Backup data exposure | **Potential** | SQL dumps in same S3 bucket as public media — may be world-readable |

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
| Code Quality & Architecture | 8/10 | High | +1.0 |
| Security & Safety | 8.5/10 | Critical | +1.0 |
| Financial & Auction Integrity | 9/10 | Critical | — |
| Real-Time System Reliability | 8.5/10 | High | — |
| Documentation & Transparency | 8/10 | Medium | +0.5 |
| Testing & Quality Assurance | 4/10 | High | — |
| DevOps & Deployment | 7/10 | Medium | — |
| Repository Hygiene & Maintenance | 7.5/10 | Low | +1.0 |

### Weighted Overall Score: 7.7 / 10

### Recommendation: Production-ready with caveats

Well-architected auction marketplace with solid financial integrity and significantly improved code organization. The `server.ts` monolith has been fully decomposed into 10 route modules (the single biggest code quality improvement across all evaluations). All bid processing paths are race-condition safe with `FOR UPDATE` row locking. Multi-service consistency is fully green. The `.claude/settings.local.json` credential issue has been resolved — now contains only 8 read-only MCP permissions.

**Key remaining risks:**
1. Backup SQL dumps may be publicly accessible via the same S3 bucket as media (public-read ACL)
2. No automated unit/integration tests — regressions only caught by type-checking
3. SSE service CORS allows any `*.vercel.app` subdomain
4. Transaction status not re-validated at void approval time
5. 94 `as any` type casts across CMS (spread across route modules — less concentrated but still high)

---

## Remedies (Priority Order)

### Immediate

1. **Verify backup bucket ACL** — Ensure `bidmo-media/backups/` prefix is not publicly accessible, or move backups to a separate private bucket.

### High Priority

2. Add automated unit tests for bid-worker financial logic
3. Re-validate transaction status at void approval time (`cms/src/routes/voidRequests.ts:147-151`)
4. Restrict SSE service CORS to specific Vercel deployments instead of `*.vercel.app` wildcard

### Medium Priority

5. Remove dead files (`create-conversations-local.ts`, `sync-bids.js`, `s3Adapter.ts`)
6. Remove debug `console.log` from bids access check (`payload.config.ts:731-741`) and `api.ts` (8 instances)
7. Update stale tech-debt documentation
8. Add `DATABASE_CA_CERT` to production to enable full TLS verification
9. Reduce `as any` casts — particularly in `voidRequests.ts` (19) and `payload.config.ts` (28)
10. Add analytics dashboard date parameter validation (reject non-date strings)

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
| 2026-03-03 | 7.2/10 | 1 critical, 4 high, 3 medium, 4 low | Regression round: `.claude/settings.local.json` regressed from minimal to 60+ broad permissions with 2 hardcoded production DB credentials in plaintext. SSE service CORS wildcard `*.vercel.app` found (NEW). `zod` missing from `package.json` caused CMS startup crash (fixed). Security 8.5→7.5 (-1.0), Hygiene 7.0→6.5 (-0.5). Overall 7.6→7.2. |
| 2026-03-04 | 7.1/10 | 1 critical, 5 high, 4 medium, 4 low | Feature growth round: 6 new features added (reports, watchlist, categories, analytics dashboard, backup, Sentry backend) — all follow security patterns. server.ts grew to 2,519 lines (+437), `as any` count 54→91. NEW: backup data exposure risk (public S3 bucket), analytics date params unvalidated, CLAUDE.md outdated for new features. Code Quality -0.5 (growing monolith + type casts), Docs -0.5 (undocumented features). zod issue RESOLVED. |
| 2026-03-04 | 7.7/10 | 0 critical, 4 high, 4 medium, 4 low | Major refactoring round: `server.ts` decomposed from 2,519 lines to 216 lines across 10 route modules (RESOLVED — biggest single improvement). `settings.local.json` cleaned to 8 read-only MCP permissions, no credentials or Bash wildcards (RESOLVED — was critical). CLAUDE.md updated with route architecture and limiters documentation (RESOLVED). Migrations extracted to preInit/postInit modules (RESOLVED). Code Quality +1.0, Security +1.0, Docs +0.5, Hygiene +1.0. Zero critical issues. |
