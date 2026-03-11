# Repository Evaluation: bidmo.to

**Date:** 2026-03-10
**Evaluator:** Claude Code (evaluate-repository command)
**Branch:** staging

---

## 1. Code Quality & Architecture — Score: 7/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `cms/src/server.ts` is 2,537 lines monolithic on staging — route modules exist in `cms/src/routes/` but are NOT imported by server.ts. Code is effectively duplicated between server.ts and route modules. Decomposition only active on `main`. | `cms/src/server.ts`, `cms/src/routes/*.ts` |
| OPEN | JWT token extraction centralized via `requireAuth` middleware on both branches, but staging server.ts also uses `authenticateJWT()` for admin-gated endpoints (create-conversations, sync-bids, backup) | `cms/src/middleware/requireAuth.ts`, `cms/src/server.ts:817,1045,795` |
| OPEN | No unit/integration test runner — only k6 stress tests | repo-wide |
| OPEN | `as any` count: 64 in `server.ts` + 28 in `payload.config.ts` + 58 in route modules = 150 total. On main (decomposed) it would be ~86. | `cms/src/server.ts`, `cms/src/payload.config.ts`, `cms/src/routes/*.ts` |
| OPEN | 15 `(global as any)` casts in `payload.config.ts` for cross-module function sharing — fragile pattern | `cms/src/payload.config.ts` |
| OPEN | Dead code: `create-conversations-local.ts` and `sync-bids.js` reference MongoDB adapter — cannot work with PostgreSQL | `cms/src/create-conversations-local.ts`, `cms/sync-bids.js` |
| OPEN | Dead code: `cms/src/s3Adapter.ts` — orphaned custom S3 adapter, not imported anywhere | `cms/src/s3Adapter.ts` |
| OPEN | Dead code: 3 unused SvelteKit adapters installed (`adapter-auto`, `adapter-node`) — only `adapter-vercel` used | `frontend/package.json` |
| OPEN | Inconsistent error handling in `api.ts` — some functions rethrow (`createRating`, `updateProduct`), most return `null` | `frontend/src/lib/api.ts` |
| OPEN | 8 `console.log` statements in `api.ts` leak product/bid data to browser devtools in production | `frontend/src/lib/api.ts:628,657,672,681,768,782,791,1156` |
| OPEN | 4 debug `console.log` in payload.config.ts — 3 in bids access check leak user IDs/emails, 1 in auto-conversation creation | `cms/src/payload.config.ts:414,751,757,761` |
| OPEN | Staging/main branch divergence: route decomposition applied on main but not staging. Both branches have route module files, but staging still uses inline routes in server.ts, creating ~2,111 lines of dead code in `cms/src/routes/`. | `cms/src/routes/*.ts` vs `cms/src/server.ts` |
| NEW | `frontend/src/routes/products/+page.svelte` is 2,587 lines — massive single component handling filters, search, SSE, admin features, product grid. Should be split into sub-components. | `frontend/src/routes/products/+page.svelte` |
| NEW | `frontend/src/routes/products/[id]/+page.svelte` is 5,090 lines — largest file in the codebase. Contains entire product detail UI, bidding, messaging, share dropdown. | `frontend/src/routes/products/[id]/+page.svelte` |
| RESOLVED | `zod` dependency was missing from `cms/package.json` — fixed | `cms/package.json` |
| RESOLVED | `server.ts` startup migration block — now extracted to `cms/src/migrations/preInit.ts` and `postInit.ts` | `cms/src/migrations/` |

**Strengths:** Well-structured multi-service architecture. TypeScript throughout, strict mode in frontend. `requireAuth` middleware and `validate()` middleware with Zod schemas on POST endpoints. Sentry integration with PII stripping. Clean bid-worker with full row-level locking. Bridge pattern (33+ routes) prevents direct CMS access from browser. Proper crash recovery via `pending_bids` table. New frontend components (ClickSpark, FloatingParticles) are well-optimized with device detection, reduced-motion support, and proper cleanup.

## 2. Security & Safety — Score: 8.5/10

### Critical

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Production DB credentials scrubbed from git history via `git-filter-repo` | Railway dashboard |
| RESOLVED | `.claude/settings.local.json` cleaned — no longer present or minimal on staging | `.claude/settings.local.json` |

### High

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Overly permissive CORS — hardcoded private IPs and server IP removed | `cms/src/server.ts:27-39` |
| OPEN | DB SSL bypass in production — `rejectUnauthorized: false` when `DATABASE_CA_CERT` not set | `cms/src/payload.config.ts:123-128` |
| OPEN | S3 ACL set to `public-read` — all uploads world-readable (acceptable for marketplace images) | `cms/src/payload.config.ts:33` |
| RESOLVED | Legacy SSE endpoint `/api/products/:id/stream` — removed | N/A |
| RESOLVED | No CI/CD test or type-check gate — type-check job now required before deploy on both staging and production | `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml` |
| RESOLVED | JWT secret inconsistency across services — now all use SHA-256-hashed `PAYLOAD_SECRET` | `cms/src/middleware/requireAuth.ts`, `services/sse-service/src/index.ts:14-15` |
| RESOLVED | Fallback bid path (Redis down) now uses `SELECT ... FOR UPDATE` row locking | `cms/src/server.ts` (staging inline) |
| RESOLVED | SSE service was missing `PAYLOAD_SECRET` env var — now in both docker-compose files | `docker-compose.staging.yml:99`, `docker-compose.prod.yml:131` |
| RESOLVED | SSE service CORS previously allowed any `*.vercel.app` subdomain — now restricted to `bidtomo.vercel.app` and `bidtomo-*.vercel.app` only | `services/sse-service/src/index.ts:94-98` |
| OPEN | Backup SQL dumps stored in same S3 bucket as public media (`backups/` prefix) — backup upload does NOT set `ACL: 'public-read'` but bucket-level policy may still expose them | `cms/src/services/backupService.ts:46,70-77` |

### Medium

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Error messages leak to clients — now guarded with `isProduction` check | `cms/src/server.ts` |
| RESOLVED | No rate limiting — now applied to login, registration, bids, analytics, reports, dashboard | `cms/src/server.ts:91-96` |
| OPEN | Redis and Elasticsearch connections have no auth by default — acceptable for Docker internal networks | `cms/src/redis.ts`, `cms/src/services/elasticSearch.ts` |
| RESOLVED | `Math.random()` for job IDs — replaced with `crypto.randomBytes()` | `cms/src/redis.ts`, `services/bid-worker/src/index.ts:69` |
| RESOLVED | Media `update` access restricted to admin only | `cms/src/payload.config.ts` |
| OPEN | `ratings` `access.update` returns `true` for all authenticated users, relying solely on `beforeChange` hook — should verify user is rating creator at access control level | `cms/src/payload.config.ts:1430` |
| OPEN | Transaction status not re-validated at void approval time (void respond endpoint checks void request status but not linked transaction's current status) | `cms/src/server.ts:1860` (staging) |
| RESOLVED | No input validation on POST bodies — Zod schemas now validate custom CMS endpoints | `cms/src/middleware/validate.ts` |
| OPEN | Analytics dashboard `from`/`to` query params weakly validated — regex matches date format but doesn't validate date bounds or that `from < to` | `cms/src/routes/analytics.ts:91-96` |

### Low

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | No security headers — helmet now installed and configured | `cms/src/server.ts` |
| RESOLVED | `sendDefaultPii: true` in Sentry — changed to `false` | `frontend/src/hooks.client.ts` |
| RESOLVED | Sentry auth token and sensitive files untracked from git | various |
| OPEN | `{@html}` usage with hardcoded data — safe but bad pattern (HTML entities for icons) | `frontend/src/routes/about-us/+page.svelte:122,132,175` |
| OPEN | `/api/health` publicly accessible, leaks Redis/Elasticsearch connection topology | `cms/src/server.ts:1597` |
| OPEN | CSRF protection allows requests with absent `Origin` header (mitigated by `SameSite=Strict` cookie) | `frontend/src/hooks.server.ts:24` |
| RESOLVED | `GET /api/typing/:productId` inconsistent auth — now uses `requireAuth` | `cms/src/server.ts:2480` |
| OPEN | Bids collection fully public read — `censorName` only affects UI, bidder IDs visible in API | `cms/src/payload.config.ts` |
| NEW | Facebook Messenger share uses invalid `app_id=0` — non-functional but not a security risk | `frontend/src/routes/products/[id]/+page.svelte:76` |

### Strengths

- No `eval()`, `exec()`, or `child_process` usage
- Server-side proxy pattern (bridge) prevents direct CMS access from browser
- JWT-based auth with proper token handling via `requireAuth` middleware and `authenticateJWT()` helper
- JWT secret consistently hashed (SHA-256) across ALL services — CMS, SSE service, and auth helpers
- No SQL injection — all SQL uses parameterized queries (bid-worker, fallback paths, analytics queries)
- All data-modifying endpoints require authentication
- Zod input validation on all custom POST endpoints with structured error responses
- Comprehensive email template escaping with `escHtml()` in bid-worker
- Seller shill-bidding prevention in CMS hooks, bid-worker SQL, AND fallback bid path
- SSE user endpoint requires JWT token verification
- Per-IP connection limiting on SSE service (20/IP)
- Helmet security headers active
- Rate limiting on login, registration, bids, analytics, reports, and analytics dashboard
- CI/CD type-check gates before deploy on BOTH staging and production workflows
- `/api/create-conversations` and `/api/sync-bids` now admin-gated
- Fallback bid/accept paths use `FOR UPDATE` row locking — consistent with bid-worker
- Sentry backend PII stripping in `beforeSend`
- Reports collection: auth + rate limiting + Zod validation + deduplication
- Watchlist collection: row-level access control (user sees own only)
- Backup endpoint admin-gated, scheduler opt-in via `BACKUP_ENABLED`
- SSE CORS now scoped to specific Vercel deployment prefixes (`bidtomo` and `bidtomo-*`)
- Docker Compose services use `condition: service_healthy` to prevent premature startup
- Production and staging fully isolated with separate Docker networks (`prod-internal`, `staging-internal`)
- No hardcoded credentials in Docker Compose — all via `${VAR}` with required markers
- Caddy auto-HTTPS for both production and staging domains
- Product detail page access control properly checks `product.active` visibility — non-admins blocked from inactive products unless seller

## 3. Financial & Auction Integrity — Score: 9/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | Second bidder acceptance now uses `SELECT ... FOR UPDATE` on product row | `cms/src/server.ts` (staging inline void-request routes) |
| OPEN | Transaction status not re-validated when void request is approved — void request respond endpoint checks void request status but not linked transaction's current status | `cms/src/server.ts:1860` |
| OPEN | `fetchMyPurchases()` N+1 query — 1 + N HTTP calls per page load (up to 102 sequential requests for 100 products) | `frontend/src/lib/api.ts:824-858` |
| RESOLVED | Fallback direct bid creation (Redis-down path) now uses `FOR UPDATE` row-level locking | `cms/src/server.ts` |
| RESOLVED | Fallback accept bid (Redis-down path) now uses `FOR UPDATE` | `cms/src/server.ts` |

**Strengths:**
- Bid-worker uses `SELECT ... FOR UPDATE` row locking — prevents double-winning
- **All bid/accept paths use `FOR UPDATE` row locking** — race-condition safe regardless of Redis availability
- Bid amount validation complete: `>= currentBid + bidInterval`, NaN/negative checks, Zod `z.number().positive().finite()` on input
- Auction end date enforced inside the locked transaction — race-condition safe
- Auction end 2-second buffer prevents bids that can't be processed in time
- Seller cannot bid on own product — checked in CMS `beforeValidate`, bid-worker SQL, AND fallback bid path
- Crash recovery via `pending_bids` PostgreSQL table — in-flight bids re-queued on restart with `ON CONFLICT (job_id) DO NOTHING`
- Complete 5-endpoint void/dispute flow with cooldowns
- Transaction status transitions properly guarded in `beforeChange` hook
- Fast-reject pre-check and batch deduplication optimize bid throughput under load

## 4. Real-Time System Reliability — Score: 8.5/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | `UserSSEClient` and `GlobalSSEClient` have no polling fallback — give up after 20 reconnects | `frontend/src/lib/sse.ts:360-362` |
| OPEN | SSE service graceful shutdown does not close existing connections or send terminal event — only quits Redis and flushes Sentry | `services/sse-service/src/index.ts:475-487` |
| RESOLVED | SSE service JWT verification now correctly uses SHA-256-hashed PAYLOAD_SECRET | `services/sse-service/src/index.ts:14-15` |
| OPEN | SSE `UserSSEClient` has fast-fail detection: connections that fail within 2 seconds are treated as auth errors and stop retrying (prevents token-expired retry spam) — good pattern but means expired-token users lose real-time updates silently | `frontend/src/lib/sse.ts:342-349` |

**Strengths:**
- Exponential backoff with 25% jitter on all SSE clients (thundering herd prevention)
- `ProductSSEClient` has full polling fallback (5s interval) when SSE fails
- Redis channel names consistent across all services (`sse:product:{id}`, `sse:user:{id}`, `sse:global`)
- Per-IP connection limiting (20/IP) on SSE service
- Elasticsearch gracefully degrades — returns empty results, frontend falls back to Payload queries
- Redis failure triggers direct bid creation fallback in CMS (graceful degradation) with proper row-level locking
- 15-second heartbeat prevents proxy/load-balancer timeout disconnections
- JWT verification consistent between CMS and SSE service
- Fast-fail auth detection prevents retry storms on expired tokens

## 5. Documentation & Transparency — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No security policy or threat model | repo-wide |
| RESOLVED | CLAUDE.md token extraction order now correctly documented | `CLAUDE.md` |
| OPEN | Tech-debt doc significantly stale — says "No rate limiting" (fixed), "No input validation" (fixed with Zod), "40+ any casts" (now 150 on staging), and "JWT auth duplication" (addressed with `requireAuth`) | `.claude/commands/tech-debt.md` |
| RESOLVED | CLAUDE.md now documents route architecture, rate limiting, and updated key file references | `CLAUDE.md` |
| RESOLVED | CLAUDE.md now documents staging environment, deployment URLs, Caddy routing, docker-compose files, and staging CI/CD workflow | `CLAUDE.md` |
| RESOLVED | CLAUDE.md bridge pattern documentation updated — describes individual `+server.ts` files and `cmsRequest()` proxy pattern accurately | `CLAUDE.md` |
| NEW | `robots.txt` and `sitemap.xml` added — proper SEO foundation with `/admin/` and `/api/` correctly disallowed | `frontend/static/robots.txt`, `frontend/static/sitemap.xml` |

**Strengths:** Comprehensive CLAUDE.md with collections list, Redis channels, global functions, frontend key files, staging environment, deployment URLs and architecture. 15+ slash commands. Portainer cheat sheet (`docs/portainer-cheatsheet.md`) for production database queries. `.env.example` templates. Active development of documentation alongside features. SEO configuration (robots.txt, sitemap.xml, Open Graph meta tags) added.

## 6. Testing & Quality Assurance — Score: 4/10

| Status | Issue | Location |
|--------|-------|----------|
| OPEN | No automated unit/integration tests — zero test files | repo-wide |
| OPEN | No ESLint/Prettier configured | repo-wide |
| RESOLVED | CI/CD now has `tsc --noEmit` and `svelte-check` gates on both staging and production | `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml` |
| RESOLVED | `zod` was missing from `cms/package.json` — fixed | `cms/package.json` |

**Strengths:** k6 stress test suite covers smoke, browse, auth, bids, full load, search, SSE, and bid-storm scenarios. CI/CD enforces type-checking before deploy on both branches. Zod validation provides runtime type safety on POST endpoints.

## 7. DevOps & Deployment — Score: 8/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | CI/CD has `type-check` job as required dependency before deploy | `.github/workflows/` |
| OPEN | Health endpoints exist but are not gated (public access to topology info) | `cms/src/server.ts:1597` |
| RESOLVED | `ecosystem.config.js` credentials — now uses `process.env` with safe defaults | `ecosystem.config.js` |
| OPEN | Automated backup scheduler added (opt-in via `BACKUP_ENABLED`) — good operational maturity but no integrity verification or restore testing | `cms/src/services/backupService.ts` |
| OPEN | Staging environment fully operational — isolated Docker Compose, separate networks, Caddy routing by hostname, dedicated CI/CD workflow | `docker-compose.staging.yml`, `.github/workflows/deploy-staging.yml`, `Caddyfile` |
| OPEN | Production deploy includes automatic database migration (`docker compose exec cms npm run migrate`), staging uses `DB_PUSH: true` for schema sync | `.github/workflows/deploy-production.yml:56`, `docker-compose.staging.yml:70` |
| OPEN | Caddy handles automatic HTTPS (Let's Encrypt) for both production and staging, plus HTTP :80 for server-to-server Vercel bridge calls | `Caddyfile` |
| OPEN | Docker health checks properly configured on all services with `start_period`, `interval`, and `condition: service_healthy` dependencies | `docker-compose.prod.yml`, `docker-compose.staging.yml` |
| NEW | Vercel build control via `vercel.json` `ignoreCommand` — only builds `main` and `staging` branches, prevents unnecessary builds on feature branches | `frontend/vercel.json` |

**Strengths:** DigitalOcean deployment with Docker Compose, Caddy auto-HTTPS, isolated staging environment on same droplet. Health endpoints on CMS and SSE. Database migrations version-controlled. CI/CD type-check gates on both branches. Concurrency control (`cancel-in-progress: true` for staging, `false` for production). SSH-based deployment via `appleboy/ssh-action`. Backup scheduler with S3 upload and retention cleanup. Sentry error tracking on all 3 backend services. Staging emails disabled (`RESEND_API_KEY: ""`), backups disabled (`BACKUP_ENABLED: "false"`). Vercel ignoreCommand prevents wasteful feature-branch builds.

## 8. Repository Hygiene & Maintenance — Score: 7.5/10

| Status | Issue | Location |
|--------|-------|----------|
| RESOLVED | `.gitignore` updated — entries added for sensitive files | `.gitignore` |
| RESOLVED | Sensitive files untracked from git via `git rm --cached` | various |
| OPEN | No LICENSE file | repo root |
| RESOLVED | PM2 ecosystem config credentials removed | `ecosystem.config.js` |
| OPEN | No CODEOWNERS, CONTRIBUTING, or PR templates | repo-wide |
| OPEN | 3 dead/orphaned files should be removed | `cms/src/create-conversations-local.ts`, `cms/sync-bids.js`, `cms/src/s3Adapter.ts` |
| RESOLVED | `.claude/settings.local.json` gitignored, not present on staging | `.gitignore:55` |
| OPEN | Branch divergence: staging has both monolith server.ts AND decomposed route modules — need to merge main's route wiring into staging or delete unused route files | `cms/src/server.ts` vs `cms/src/routes/*.ts` |

**Strengths:** Clean git history with focused commits, good `.gitignore` coverage. Active development velocity (30 commits in recent history covering SEO, performance, UI fixes, animations). Staging infrastructure scripts (`scripts/setup-staging.sh`, `scripts/migrate-to-staging.sh`). No credentials in source code or configuration files.

---

## Claude-Code-Specific Checklist

| Item | Status | Notes |
|------|--------|-------|
| Defines hooks | No | — |
| Hooks execute shell scripts | N/A | — |
| Commands invoke shell/external tools | Yes | 15+ markdown commands — documentation only, no shell execution |
| Commands reference project-specific paths or secrets | No | Commands reference file paths but no secrets |
| `.claude/settings.local.json` grants elevated permissions | N/A | File not present on staging (gitignored) |
| Persistent state files influence control flow | No | — |
| Network access triggered by tooling (MCP servers, deploy commands) | Yes | `.mcp.json` present (untracked) — MCP servers for Playwright, Railway, Vercel |
| Safe defaults | **Yes** | No pre-authorized permissions on staging |
| Clear disable mechanism for automation | Yes | Standard Claude Code permission system |
| Documentation covers all `.claude/` configuration | Partial | Commands documented in CLAUDE.md, MCP servers not documented |

---

## Permissions & Side Effects Analysis

### A. Declared Permissions

- **File system:** Read/write within project directory, media uploads to DigitalOcean Spaces
- **Network:** Dev servers (:5173, :3001, :3002), Docker, DigitalOcean droplet (SSH deploy)
- **Execution:** GitHub Actions SSH deploy, Docker Compose build/up
- **APIs:** Vercel (frontend hosting), Resend (email), Sentry (error tracking), DigitalOcean Spaces (S3)

### B. Actual Permissions (from code)

- **File system:** Standard project access, S3 uploads (media + backups) — **Confirmed**
- **Network:** CMS ↔ PostgreSQL, Redis, Elasticsearch (all Docker internal). Outbound: Sentry, Resend, S3. — **Confirmed**
- **Execution:** No `eval()`, `exec()`, or `child_process`. GitHub Actions deploys via SSH. — **Confirmed**
- **APIs:** Payload REST, Express custom endpoints, DigitalOcean S3, Resend, Sentry — **Confirmed**

### C. Discrepancies

| Declared | Actual | Severity |
|----------|--------|----------|
| Standard deployment | SSH-based Docker Compose deploy — well-isolated | **None** |
| Email via Resend | Staging disables email (`RESEND_API_KEY: ""`) — safe | **None** |
| Backup to S3 | Staging disables backups (`BACKUP_ENABLED: "false"`) — safe | **None** |

---

## Red Flag Scan

| Check | Found | Notes |
|-------|-------|-------|
| Hardcoded credentials in source | **No** | All env-based, Docker Compose uses `${VAR}` with `:?` required markers |
| Unauthenticated data-modifying endpoints | **No** | All data-modifying endpoints require auth. `create-conversations` and `sync-bids` admin-gated. |
| Missing rate limiting on auth/financial | **No** | Rate limiting on login, registration, bids, analytics, reports, dashboard |
| Unvalidated user input in DB queries | **No** | All SQL parameterized, Zod on POST bodies |
| Overly permissive CORS | **No** | CMS CORS clean. SSE CORS now scoped to `bidtomo` and `bidtomo-*` Vercel deployments. |
| Secrets in git history | Resolved | Scrubbed via `git-filter-repo` |
| `eval()` or dynamic code execution | **No** | — |
| Unbounded queries | Low risk | Payload default pagination, search capped at 50 results |
| Missing error handling on financial ops | **No** | Full try/catch/ROLLBACK on all paths |
| Credential leakage in logs | Medium | 8 `console.log` in `api.ts` with product/bid data; 4 debug logs in `payload.config.ts` with user emails |
| Malware/spyware | **No** | — |
| Supply-chain risks | Low | Well-known dependency publishers |
| Backup data exposure | **Reduced** | Backup uploads don't set `public-read` ACL, but same bucket as public media — verify bucket policy |

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
| Docker health checks configured | ✓ | ✓ | N/A |
| Sentry integration | ✓ | ✓ | ✓ (frontend) |

---

## Technical Debt Assessment

### `.claude/commands/tech-debt.md` Review

| Doc Item | Current Status | Notes |
|----------|---------------|-------|
| JWT auth duplication | **Partially fixed** | `requireAuth` middleware handles most endpoints; 3 admin-gated endpoints still use `authenticateJWT()` |
| Missing database indexes | **Still OPEN** | Not verified — no evidence of index creation in migrations |
| No input validation | **Fixed** | Zod schemas on all POST endpoints via `validate()` middleware |
| 40+ `any` casts | **Worse** | Now 150 on staging (64 server.ts + 28 config + 58 routes), though ~58 are in unused route modules |
| N+1 queries | **Still OPEN** | `fetchMyPurchases()` still makes 1+N HTTP calls |
| No rate limiting | **Fixed** | Rate limiting on all key endpoints |
| No test suite | **Still OPEN** | Zero test files |

### Undocumented Debt

1. **Branch divergence** — staging/main have diverged significantly in server.ts structure
2. **Duplicate route definitions** — 2,111 lines of unused route modules on staging
3. **Debug console.logs in production** — 12 total across api.ts and payload.config.ts
4. **`(global as any)` pattern** — 15 instances for cross-module function sharing
5. **Backup bucket isolation** — backups share bucket with public media
6. **Giant frontend files** — product detail page (5,090 lines) and products list (2,587 lines) should be decomposed into sub-components
7. **Hardcoded domain in OG meta tags** — `https://bidmo.to` hardcoded instead of dynamic origin
8. **Invalid Facebook app_id** — Messenger share non-functional (`app_id=0`)

---

## Overall Assessment

### Category Scores

| Category | Score | Weight | Change |
|----------|-------|--------|--------|
| Code Quality & Architecture | 7/10 | High | — |
| Security & Safety | 8.5/10 | Critical | — |
| Financial & Auction Integrity | 9/10 | Critical | — |
| Real-Time System Reliability | 8.5/10 | High | — |
| Documentation & Transparency | 8/10 | Medium | +0.5 |
| Testing & Quality Assurance | 4/10 | High | — |
| DevOps & Deployment | 8/10 | Medium | — |
| Repository Hygiene & Maintenance | 7.5/10 | Low | — |

### Weighted Overall Score: 7.7 / 10

### Recommendation: Production-ready with caveats

Solid auction marketplace with strong financial integrity (all bid paths race-condition safe with `FOR UPDATE` locking) and improved security posture. Recent development focused on frontend polish: SEO optimizations (robots.txt, sitemap.xml, OG meta tags, Lighthouse performance), UI animations (ClickSpark, FloatingParticles), dark theme fixes, and product detail page enhancements. No backend regressions introduced.

**Key remaining risks:**
1. Backup SQL dumps share S3 bucket with public media — verify bucket-level ACL
2. No automated unit/integration tests — regressions only caught by type-checking
3. Transaction status not re-validated at void approval time
4. Staging server.ts is monolithic with unused route module files (branch divergence)
5. Giant frontend files (5,090 and 2,587 lines) becoming maintenance risk

---

## Remedies (Priority Order)

### Immediate

1. **Merge route decomposition from main to staging** — server.ts should import from `cms/src/routes/` instead of having inline routes. This eliminates ~2,300 lines of duplication.

### High Priority

2. **Verify backup bucket ACL** — Ensure `backups/` prefix in S3 bucket is not publicly accessible, or move backups to a separate private bucket.
3. Add automated unit tests for bid-worker financial logic
4. Re-validate transaction status at void approval time (`cms/src/server.ts:1860`)

### Medium Priority

5. Decompose giant frontend files — split product detail (5,090 lines) and products list (2,587 lines) into sub-components
6. Remove dead files (`create-conversations-local.ts`, `sync-bids.js`, `s3Adapter.ts`)
7. Remove debug `console.log` from payload.config.ts (4 instances) and api.ts (8 instances)
8. Update stale tech-debt documentation
9. Fix hardcoded `https://bidmo.to` in OG meta tags — use dynamic origin
10. Add `DATABASE_CA_CERT` to production to enable full TLS verification
11. Reduce `as any` casts — particularly `(global as any)` pattern (15 in payload.config.ts)
12. Fix Facebook Messenger share `app_id=0` or remove the option

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
| 2026-03-05 | 7.6/10 | 0 critical, 2 high, 5 medium, 4 low | Staging branch evaluation: SSE CORS wildcard RESOLVED (now scoped to `bidtomo*`). Staging environment fully operational with isolated Docker Compose, Caddy auto-HTTPS, health checks, dedicated CI/CD. DevOps +1.0. However, staging server.ts still monolithic (2,530 lines) with unused route modules (branch divergence from main). Code Quality -1.0, Docs -0.5 due to staging-specific issues. 3 NEW findings (branch divergence, CLAUDE.md staging gaps, SSE fast-fail auth detection). |
| 2026-03-10 | 7.7/10 | 0 critical, 2 high, 5 medium, 5 low | Frontend polish round: 12 commits since last eval — all frontend-focused (SEO/Lighthouse, ClickSpark animation, FloatingParticles optimization, dark theme fixes, product detail metadata, robots.txt/sitemap.xml). No backend changes so no regressions. CLAUDE.md staging docs RESOLVED (+0.5 docs). NEW: giant frontend files (5,090 + 2,587 lines), hardcoded OG domain, invalid Facebook app_id. Vercel build control added. Zero critical issues maintained. |
