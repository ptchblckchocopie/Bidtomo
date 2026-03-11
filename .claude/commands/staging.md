# Staging Environment

Fully isolated staging on the same DigitalOcean droplet as production. Separate git clone, Docker networks, databases, and secrets.

## URLs

| Service | URL |
|---------|-----|
| **Backend HTTPS** | `https://staging.188-166-216-176.sslip.io` |
| **Admin** | `https://staging.188-166-216-176.sslip.io/admin` |
| **SSE** | `https://staging.188-166-216-176.sslip.io/sse` |
| **Frontend** | Vercel preview deployments (any non-main branch) |

## Infrastructure

- **App directory:** `/opt/bidtomo-staging/` (branch: `staging`)
- **Compose file:** `docker-compose.staging.yml`
- **Containers:** `staging-cms`, `staging-sse`, `staging-postgres`, `staging-redis`, `staging-bid-worker`
- **Networks:** `bidtomo-shared` (external, shared with prod Caddy) + `staging-internal` (isolated)

**Architecture:** One Caddy (`prod-caddy`) routes both envs by hostname via `bidtomo-shared` network. Each env has its own internal network isolating postgres and redis.

## Developer Workflow

```
feature/x → staging → main
  (dev)      (test)   (production)
```

Push to `staging` branch triggers `deploy-staging.yml` → deploys to `/opt/bidtomo-staging/`.
Push to `main` triggers `deploy-production.yml` → deploys to `/opt/bidtomo/`.

## Key Differences from Production

| Setting | Staging | Production |
|---------|---------|------------|
| `DB_PUSH` | `true` (auto-sync schema) | `false` (runs migrations) |
| `RESEND_API_KEY` | `""` (emails disabled) | Real key |
| `BACKUP_ENABLED` | `false` | `true` |
| `PAYLOAD_SECRET` | Different value | Different value |

## Deploying to Staging

```bash
# Push to staging branch — GitHub Actions handles the rest
git push origin staging

# Frontend: any non-main push triggers Vercel preview with staging env vars
```

## Vercel Staging Variables (scope: Preview)

- `CMS_URL` = `https://staging.188-166-216-176.sslip.io` (HTTPS required — Caddy 308 redirect strips Auth headers)
- `PUBLIC_SSE_URL` = `https://staging.188-166-216-176.sslip.io/sse`
- `PUBLIC_SENTRY_ENVIRONMENT` = `staging`

## Running Stress Tests Against Staging

```bash
cd tests/stress
node seed-data.js
k6 run --env CMS_URL=https://staging.188-166-216-176.sslip.io \
       --env SSE_URL=https://staging.188-166-216-176.sslip.io/sse \
       --out json=results/staging-all.json run.js
node generate-report.js results/staging-all.json
```
