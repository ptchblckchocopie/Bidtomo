# Deployment Guide

## Current Setup (March 2026)

**Railway expired** — all Railway deployments removed. Backend migrated to **DigitalOcean**.

- **Frontend** → Vercel at `www.bidmo.to` (auto-deploy from `main` branch)
- **Backend** → DigitalOcean droplet `188.166.216.176` with `docker-compose.prod.yml`
- **App directory on droplet:** `/opt/bidtomo`

## URLs

| Environment | Frontend | Backend HTTPS | Admin | SSE |
|-------------|----------|---------------|-------|-----|
| **Production** | `https://www.bidmo.to` | `https://188-166-216-176.sslip.io` | `/admin` | `/sse` |
| **Staging** | Vercel preview | `https://staging.188-166-216-176.sslip.io` | `/admin` | `/sse` |

- Backend HTTP (internal): `http://188.166.216.176` (server-to-server from Vercel)
- Portainer (Docker UI): `https://188.166.216.176:9443`
- sslip.io provides free auto-HTTPS via Let's Encrypt (temporary until `api.bidmo.to` DNS configured)

## Vercel Environment Variables

**Production** (scope: Production):
- `CMS_URL` = `http://188.166.216.176` (HTTP via Caddy `:80`)
- `PUBLIC_SSE_URL` = `https://188-166-216-176.sslip.io/sse`

**Staging** (scope: Preview):
- `CMS_URL` = `https://staging.188-166-216-176.sslip.io` (HTTPS required — Caddy 308 redirects strip Authorization headers)
- `PUBLIC_SSE_URL` = `https://staging.188-166-216-176.sslip.io/sse`
- `PUBLIC_SENTRY_ENVIRONMENT` = `staging`

## Production Infrastructure

- **`docker-compose.prod.yml`** — Caddy + 5 prod containers + Postgres + Redis (7 total). Container names: `prod-caddy`, `prod-cms`, `prod-sse`, `prod-postgres`, `prod-redis`, `prod-bid-worker`. Networks: `bidtomo-shared` (external) + `prod-internal`.
- **`Caddyfile`** — HTTPS `{$DOMAIN}` → prod, HTTPS `{$STAGING_DOMAIN}` → staging, HTTP `:80` with host-based routing. Uses container names (`prod-cms`, `staging-cms`).
- **`scripts/setup-droplet.sh`** — Initial droplet setup: Docker, fail2ban, UFW.
- **`.env.production.example`** — Production env template.
- **`deploy.sh`** — Blue/green deployment with atomic symlink swaps.

## Docker Compose Files

- `docker-compose.local.yml` — Local dev (Postgres :5433, Redis :6380, no app containers)
- `docker-compose.prod.yml` — Production (Caddy + `prod-*` containers, `bidtomo-shared` + `prod-internal`)
- `docker-compose.staging.yml` — Staging (`staging-*` containers, `bidtomo-shared` + `staging-internal`)
- `docker-compose.yml` — **Stale/legacy**, do not use

## CI/CD

- **CI gate:** `tsc --noEmit` (CMS) + `npm run check` (frontend). No unit tests.
- **GitHub Actions:** `deploy-staging.yml` (`staging` → `/opt/bidtomo-staging/`), `deploy-production.yml` (`main` → `/opt/bidtomo/`). Both via SSH (`appleboy/ssh-action@v1`) with concurrency groups.
- **GitHub Secrets:** `DROPLET_IP`, `SSH_USER`, `SSH_PRIVATE_KEY`.
- **Sentry** — All 4 services report errors. Release tracking via `GIT_SHA` build arg. Frontend: `sentrySvelteKit()` + Session Replay. Backend: `@sentry/node` with `instrument.ts` files. Key files: `frontend/src/hooks.client.ts`, `cms/src/instrument.ts`, `services/*/src/instrument.ts`.
- **DigitalOcean MCP** configured in `.claude.json`. Use `/mcp` to connect.

## DNS (pending)

DigitalOcean DNS zone configured (A records for `@` and `api` → droplet, CNAME `www` → Vercel, MX + SPF). Nameservers need changing at Namecheap from `registrar-servers.com` to `ns1/ns2/ns3.digitalocean.com`. Then update `DOMAIN=api.bidmo.to` and Vercel env vars.

## Important Notes

- **CMS `serverURL`** — Set to `process.env.SERVER_URL || ''` (empty string = relative URLs, works from any domain).
- **CMS Admin Webpack** — Do NOT add `admin.css` to Payload config. The `css` property triggers a Sass import that fails in Nixpacks builds.
