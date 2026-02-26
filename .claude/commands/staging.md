# Staging Environment

Staging is a full duplicate of production for testing before deploying to prod.

## Infrastructure

| Service | Staging URL | Production URL |
|---------|-------------|----------------|
| **CMS** | `https://cms-staging-v2.up.railway.app` | `https://cms-production-d0f7.up.railway.app` |
| **SSE** | `https://sse-service-staging-v2.up.railway.app` | `https://sse-service-production-1d4e.up.railway.app` |
| **Frontend** | Vercel preview deployments (any non-main branch) | `https://bidtomo.vercel.app` (main branch) |
| **Database** | Separate Postgres (Railway staging-v2 env) | Separate Postgres (Railway production env) |
| **Redis** | Separate Redis (Railway staging-v2 env) | Separate Redis (Railway production env) |
| **Elasticsearch** | Separate ES (Railway staging-v2 env) | Separate ES (Railway production env) |

Railway environment name: `staging-v2`
Railway environment ID: `efbcf9cb-01bb-48eb-8734-d083b220b734`

## How It Works

- **Railway**: The `staging-v2` environment is a full duplicate of `production` with its own Postgres, Redis, Elasticsearch, and separate public domains. All services (CMS, SSE, bid-worker) run independently.
- **Vercel**: Preview deployments (any branch except `main`) automatically use staging CMS and SSE URLs. Production deployments (`main` branch) use production URLs.
- **Storage**: Same Supabase bucket (`bidmo-media`) but staging should use prefix `bidmoto-staging/` to avoid mixing files.

## Deploying to Staging

### Railway (CMS, SSE, bid-worker)
```bash
# Link to staging environment
npx @railway/cli environment link staging-v2

# Deploy individual services
npx @railway/cli up --service cms --detach
npx @railway/cli up --service sse-service --detach
npx @railway/cli up --service bid-worker --detach

# Check staging logs
npx @railway/cli logs --service cms --lines 50

# Check all service statuses
npx @railway/cli service status --all
```

### Frontend (Vercel)
```bash
# Any push to a non-main branch triggers a preview deployment with staging env vars
git push origin staging

# Or deploy manually as a preview
cd frontend
npx vercel --token <TOKEN> --scope ptchblckchocopies-projects
```

Preview deployments should be configured with:
- `PUBLIC_API_URL=https://cms-staging-v2.up.railway.app`
- `PUBLIC_SSE_URL=https://sse-service-staging-v2.up.railway.app`

## Switching Railway CLI Between Environments

```bash
# Switch to staging
npx @railway/cli environment link staging-v2

# Switch back to production
npx @railway/cli environment link production

# Check which environment you're on
npx @railway/cli status
```

## Staging Variables (Differences from Production)

| Variable | Staging Value | Notes |
|----------|--------------|-------|
| `SERVER_URL` | `https://cms-staging-v2.up.railway.app` | CMS self-URL |
| `FRONTEND_URL` | `https://bidtomo-staging.vercel.app` | Frontend URL |
| `NODE_ENV` | `staging` | Distinguishes from production |
| `DB_PUSH` | `true` | Auto-sync schema on startup |
| `SSE_CORS_ORIGIN` | `https://bidtomo-staging.vercel.app,https://cms-staging-v2.up.railway.app` | CORS for staging frontend |
| `DATABASE_URI` | Auto-assigned by Railway | Separate Postgres instance |
| `REDIS_URL` | Auto-assigned by Railway | Separate Redis instance |
| `ELASTICSEARCH_URL` | Auto-assigned by Railway | Separate ES instance |

## Database Migrations for Staging

The staging DB uses `DB_PUSH=true` for automatic schema sync. For a fresh database:

```bash
# Connect to staging Postgres (public URL)
# Check Railway Postgres service variables for DATABASE_PUBLIC_URL

# Run Payload migrations locally against staging DB
cd cms
DATABASE_URI="<DATABASE_PUBLIC_URL>" PAYLOAD_CONFIG_PATH=src/payload.config.ts npx payload migrate

# Or for a complete schema push (drop + recreate):
DATABASE_URI="<DATABASE_PUBLIC_URL>" DB_PUSH=true PAYLOAD_SECRET=temp SERVER_URL="" REDIS_URL="" ELASTICSEARCH_URL="" timeout 45 npm run dev
```

## Running Stress Tests Against Staging

```bash
cd tests/stress
node seed-data.js  # Seeds staging database

# Run against staging Railway directly
k6 run --env CMS_URL=https://cms-staging-v2.up.railway.app \
       --env SSE_URL=https://sse-service-staging-v2.up.railway.app \
       --out json=results/staging-all.json run.js

node generate-report.js results/staging-all.json
```
