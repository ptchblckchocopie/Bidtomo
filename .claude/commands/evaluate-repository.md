# Repository Evaluation Prompt — Bidtomo Auction Marketplace

## Evaluation Context

You are evaluating **Bidtomo (BidMo.to)**, a production full-stack auction marketplace with real-time bidding. This is a multi-service Node.js/TypeScript application where financial operations (bidding, transactions, void/dispute resolution) carry real monetary risk.

### Architecture Awareness

Before scoring, internalize the system topology:

```
Browser (SPA, SSR disabled)
  ├── SvelteKit /api/bridge/* (33 proxy endpoints)
  │     └── Payload CMS :3001 (Express, 20+ custom endpoints)
  │           ├── PostgreSQL (8 collections, row-level locking for bids)
  │           ├── Elasticsearch 9 (product search, fuzzy matching)
  │           ├── Supabase S3 (media storage, bucket: bidmo-media)
  │           └── Redis (pub/sub + FIFO bid queue)
  │                 ├── SSE Service :3002 (real-time event broadcaster)
  │                 └── Bid Worker (atomic queue consumer, crash recovery)
  └── SSE EventSource → :3002/events/{products|users|global}
```

**Services (independently deployed, NOT a monorepo):**
- `frontend/` — SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel
- `cms/` — Payload CMS 2 on Express, PostgreSQL, Elasticsearch, Redis
- `services/sse-service/` — Redis-to-SSE event relay
- `services/bid-worker/` — Atomic bid processor with PostgreSQL FOR UPDATE locking

**Deployment:** Railway (CMS, SSE, bid-worker, Postgres, Redis, ES) + Vercel (frontend)

**CI/CD:** GitHub Actions — non-main branches auto-deploy to staging, main auto-deploys to production

---

## Instructions

Perform a thorough, evidence-based review of this repository.

1. **Read first, score second** — Read `CLAUDE.md`, `cms/src/server.ts`, `cms/src/payload.config.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/sse.ts`, `services/bid-worker/src/index.ts`, `services/sse-service/src/index.ts` before assigning any scores.
2. **Run `git log --oneline -30`** to understand recent development velocity and patterns.
3. **Run `git ls-files | head -100`** to map the file structure.
4. **Do not execute** application code, install dependencies, or start services.
5. Base your assessment on repository contents, documentation, and code inspection.

When uncertain, state what you cannot verify and why.

---

## Evaluation Criteria

For each category: assign a score (1–10), provide evidence-based justification, and note uncertainties.

### 1. Code Quality & Architecture (Weight: High)

Assess across all 4 services:

- **Structure** — Separation of concerns between services. Are responsibilities cleanly divided?
- **Type safety** — TypeScript usage quality. Count `any` casts in key files (`server.ts`, `api.ts`).
- **Consistency** — Are patterns (auth, error handling, API responses) uniform or fragmented?
- **Complexity** — Are large files (server.ts ~2100 lines, api.ts ~1400 lines) maintainable? Should logic be extracted?
- **Dead code** — Unused imports, commented-out blocks, vestigial features.
- **Collection design** — Are Payload CMS collections normalized? Relationship fields appropriate?

Key files to inspect:
| File | Lines | Role |
|------|-------|------|
| `cms/src/server.ts` | ~2135 | All custom Express endpoints |
| `cms/src/payload.config.ts` | ~1331 | All collection definitions + hooks |
| `frontend/src/lib/api.ts` | ~1400 | Typed API client |
| `frontend/src/lib/sse.ts` | ~560 | Real-time SSE clients |
| `services/bid-worker/src/index.ts` | ~997 | Atomic bid processing |
| `services/sse-service/src/index.ts` | ~414 | SSE event broadcaster |

### 2. Security & Safety (Weight: Critical)

This is an auction marketplace handling money. Evaluate:

- **Authentication** — Is JWT validation consistent across all 20+ custom endpoints? Count endpoints missing auth.
- **Authorization** — Can users modify other users' products/bids/transactions? Check access control hooks on every collection.
- **Input validation** — Are POST body fields validated (types, ranges, required fields)? Is there Zod/Joi or equivalent?
- **SQL injection** — Any raw SQL in `server.ts` or `bid-worker`? Are queries parameterized?
- **Race conditions** — Does the bid-worker properly use `FOR UPDATE` row locking? Can bids be double-processed?
- **Credential exposure** — Check `docker-compose.yml`, `.env` files, `settings.local.json` for hardcoded secrets. Check `.gitignore` coverage.
- **CORS policy** — Is the CORS allowlist in both `payload.config.ts` and `server.ts` appropriate? Any wildcards?
- **Unauthenticated endpoints** — Which endpoints in `server.ts` lack auth? (Known: `POST /api/create-conversations`, `POST /api/sync-bids`)
- **Rate limiting** — Is there any rate limiting on auth endpoints, bid queuing, or media uploads?
- **XSS / injection** — Are user inputs (product titles, messages, descriptions) sanitized before rendering?

### 3. Financial & Auction Integrity (Weight: Critical)

Unique to auction platforms:

- **Bid atomicity** — Verify the bid-worker's locking mechanism prevents two users from winning simultaneously.
- **Bid amount validation** — Is `amount >= currentBid + bidInterval` enforced at both CMS and worker level?
- **Auction end enforcement** — Can bids be placed after `auctionEndDate`? Check both the API endpoint and the worker.
- **Transaction state machine** — Are transaction status transitions (`pending → in_progress → completed/cancelled/voided`) properly guarded?
- **Void/dispute flow** — Is the 5-endpoint void request flow complete? Can it be abused (e.g., void after payment)?
- **Currency handling** — Multi-currency support (PHP, USD, EUR, GBP, JPY) — is conversion handled or just display?
- **Seller self-bidding** — Can a seller bid on their own product? Check validation.

### 4. Real-Time System Reliability (Weight: High)

- **SSE reconnection** — Does the frontend SSE client handle disconnects gracefully? Check exponential backoff + jitter.
- **Redis failure mode** — What happens to bids when Redis is down? Is there a fallback path? Is it complete?
- **Elasticsearch failure mode** — Does search degrade gracefully to Payload queries?
- **Bid-worker crash recovery** — Are in-flight bids persisted to `pending_bids` table? Does restart re-queue them?
- **Message ordering** — Are SSE events delivered in order? Can bid events arrive out of sequence?
- **Connection limits** — Is `ulimit` documented for SSE service? What's the practical max concurrent connections?

### 5. Documentation & Transparency (Weight: Medium)

- **CLAUDE.md** — Does it accurately describe the architecture and key files?
- **Slash commands** — Are the 8 `.claude/commands/*.md` files current and accurate?
- **Inline comments** — Are complex sections (bid-worker optimizations, void flow, hook patterns) documented?
- **API documentation** — Are all 20+ custom endpoints documented with request/response shapes?
- **Setup instructions** — Can a new developer get the project running from documentation alone?
- **Discrepancies** — Does documentation match actual behavior? Check endpoint paths, env var names, collection fields.

### 6. Testing & Quality Assurance (Weight: High)

- **Unit tests** — Count test files. (Known: zero)
- **Integration tests** — Any API endpoint tests?
- **Stress tests** — Evaluate `tests/stress/` suite: coverage, realism, threshold values.
- **Type checking** — Does `npm run check` pass in `frontend/`? Does `tsc` pass in `cms/`?
- **Linting** — Is ESLint/Prettier configured? Any lint rules?
- **Manual testing paths** — Are critical flows (register → list → bid → win → message → rate → void) covered by any automated test?

### 7. DevOps & Deployment (Weight: Medium)

- **CI/CD** — Evaluate `.github/workflows/` — are there build/test steps before deploy, or just blind deploy?
- **Environment parity** — Is staging a true duplicate of production? Same services, same config shape?
- **Rollback** — Can a bad deploy be rolled back? Is there blue/green or canary deployment?
- **Health checks** — Do Railway services have health endpoints? Are they configured?
- **Secrets management** — Are secrets in Railway/Vercel dashboards or hardcoded somewhere?
- **Database migrations** — Are migrations version-controlled? Can they run idempotently?

### 8. Repository Hygiene & Maintenance (Weight: Low)

- **Git history** — Clean commit messages? Feature branches? PR-based workflow?
- **Dependencies** — Are packages up to date? Any known vulnerabilities? (`npm audit`)
- **File organization** — Logical directory structure? Any misplaced files?
- **License** — Is there a LICENSE file?
- **`.gitignore`** — Are `node_modules/`, `.env`, `dist/`, `media/` properly excluded?
- **Dead files** — Any orphaned scripts, unused migrations, temp files checked in?

---

## Multi-Service Consistency Checklist

For each service pair, verify consistency:

| Check | CMS ↔ Bid Worker | CMS ↔ SSE Service | CMS ↔ Frontend Bridge |
|-------|:-:|:-:|:-:|
| Redis channel names match | | | |
| JWT token format handled identically | | | |
| Error response shapes consistent | | | |
| Product status enum values aligned | | | |
| Bid amount types (number vs string) consistent | | | |
| Environment variable names aligned | | | |

---

## Claude Code Ecosystem Checklist

Answer each item with Yes/No + brief explanation:

- [ ] Defines hooks (`.claude/hooks/` or hook config)
- [ ] Hooks execute shell scripts
- [ ] Custom commands invoke shell or external tools
- [ ] Commands reference project-specific paths or secrets
- [ ] `.claude/settings.local.json` grants elevated permissions
- [ ] Persistent state files influence control flow
- [ ] Network access triggered by tooling (MCP servers, deploy commands)
- [ ] Safe defaults — can a new contributor clone and run without risk?
- [ ] Clear disable mechanism for automation (hooks, CI triggers)
- [ ] Documentation covers all `.claude/` configuration

Inspect `.claude/settings.local.json` for overly broad Bash permissions. Flag any `Bash(*)` wildcards or credentials embedded in permission strings.

---

## Permissions & Side Effects Analysis

### A. Declared Permissions (from documentation)

- **File system:** Media uploads to Supabase S3, local media directory in Docker
- **Network:** CMS ↔ PostgreSQL, Redis, Elasticsearch, Supabase, Resend (email). Frontend ↔ CMS bridge. SSE ↔ Redis.
- **Execution:** GitHub Actions deploys on push. PM2 process management (`ecosystem.config.js`).
- **APIs:** Payload REST API, custom Express endpoints, Supabase Storage API, Resend email API, Railway CLI, Vercel CLI

### B. Actual Permissions (inferred from code)

- **File system:** [Verify against code]
- **Network:** [Verify all outbound connections in server.ts, emailService.ts, elasticSearch.ts]
- **Execution:** [Check for eval(), child_process, dynamic require]
- **APIs:** [List all external API calls with auth methods]

Mark each as: **Confirmed** / **Likely** / **Unclear**

### C. Discrepancies

List any mismatches between A and B.

---

## Red Flag Scan

Check each and justify with file:line references:

- [ ] Hardcoded credentials in source code (not `.env`)
- [ ] Unauthenticated endpoints that modify data
- [ ] Missing rate limiting on auth/financial endpoints
- [ ] Unvalidated user input in database queries
- [ ] Overly permissive CORS (wildcards, `*`)
- [ ] Secrets in git history (`git log --all --diff-filter=A -- '*.env' '.env*'`)
- [ ] `eval()` or dynamic code execution
- [ ] Unbounded queries (no pagination limit, no max results)
- [ ] Missing error handling on financial operations
- [ ] Credential leakage in logs (`console.log` with tokens/passwords)

---

## Technical Debt Assessment

Reference `/.claude/commands/tech-debt.md` for known items. Evaluate:

1. **Severity ranking** — Which debt items pose production risk vs. developer inconvenience?
2. **Missing items** — What debt is NOT documented but exists in the codebase?
3. **Remediation priority** — Rank the top 5 items by impact/effort ratio.

---

## Overall Assessment

### Category Scores

| Category | Score | Weight |
|----------|-------|--------|
| Code Quality & Architecture | /10 | High |
| Security & Safety | /10 | Critical |
| Financial & Auction Integrity | /10 | Critical |
| Real-Time System Reliability | /10 | High |
| Documentation & Transparency | /10 | Medium |
| Testing & Quality Assurance | /10 | High |
| DevOps & Deployment | /10 | Medium |
| Repository Hygiene | /10 | Low |

### Weighted Overall Score: X / 10

### Recommendation

Choose one:
- **Production-ready** — Safe for real users and real money
- **Production-ready with caveats** — Functional but specific risks must be addressed
- **Needs remediation before production** — Critical issues that could cause data loss or financial harm
- **Development/staging only** — Not safe for production use

### Top 5 Action Items

List the 5 highest-impact improvements, ordered by urgency:

1. [Critical/High/Medium] — Description + affected files
2. ...
3. ...
4. ...
5. ...

---

## Output Format

- Use the section headings above
- Include file:line references for all claims
- Keep scores evidence-based — no generous rounding
- Clearly separate confirmed issues from suspected issues
- End with actionable, specific remediation steps

---

REPOSITORY: The Bidtomo repository you are currently working in.

IF ARGUMENTS PRESENT: <REPO>$ARGUMENTS</REPO>
