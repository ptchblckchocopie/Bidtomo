# Staging Environment

Staging is a full duplicate of production for testing before deploying to prod.

## Infrastructure

| Service | Staging URL | Production URL |
|---------|-------------|----------------|
| **CMS** | `https://cms-staging-d22f.up.railway.app` | `https://cms-production-d0f7.up.railway.app` |
| **SSE** | `https://sse-service-staging-c38f.up.railway.app` | `https://sse-service-production-1d4e.up.railway.app` |
| **Frontend** | Vercel preview deployments (any non-main branch) | `https://bidtomo.vercel.app` (main branch) |
| **Database** | Separate Postgres (Railway staging env) | Separate Postgres (Railway production env) |
| **Redis** | Separate Redis (Railway staging env) | Separate Redis (Railway production env) |

Railway environment ID: `c91ea05d-4754-42ad-8cc3-ccf5a33c14fe`

## How It Works

- **Railway**: The `staging` environment is a full duplicate of `production` with its own Postgres, Redis, Elasticsearch, and separate public domains. All services (CMS, SSE, bid-worker) run independently.
- **Vercel**: Preview deployments (any branch except `main`) automatically use staging CMS and SSE URLs. Production deployments (`main` branch) use production URLs.
- **Storage**: Same Supabase bucket (`bidmo-media`) but staging should use prefix `bidmoto-staging/` to avoid mixing files.

## Deploying to Staging

### Railway (CMS, SSE, bid-worker)
```bash
# Link to staging environment
npx @railway/cli link --environment staging

# Deploy CMS to staging
cd cms
npx @railway/cli up --detach --environment staging

# Check staging logs
npx @railway/cli logs --lines 50 --environment staging

# Deploy all services (link each service first)
npx @railway/cli link --service cms && npx @railway/cli up --detach --environment staging
npx @railway/cli link --service sse-service && npx @railway/cli up --detach --environment staging
npx @railway/cli link --service bid-worker && npx @railway/cli up --detach --environment staging
```

### Frontend (Vercel)
```bash
# Any push to a non-main branch triggers a preview deployment with staging env vars
git push origin staging

# Or deploy manually as a preview
cd frontend
npx vercel --token <TOKEN> --scope ptchblckchocopies-projects
```

Preview deployments automatically get:
- `CMS_URL=https://cms-staging-d22f.up.railway.app`
- `PUBLIC_SSE_URL=https://sse-service-staging-c38f.up.railway.app/`

## Switching Railway CLI Between Environments

```bash
# Switch to staging
npx @railway/cli link --environment staging

# Switch back to production
npx @railway/cli link --environment production

# Check which environment you're on
npx @railway/cli status
```

## Staging Variables (Differences from Production)

| Variable | Staging Value | Notes |
|----------|--------------|-------|
| `SERVER_URL` | `https://cms-staging-d22f.up.railway.app` | CMS self-URL |
| `FRONTEND_URL` | `https://bidtomo-staging.vercel.app` | Frontend URL |
| `NODE_ENV` | `staging` | Distinguishes from production |
| `SSE_CORS_ORIGIN` | `https://bidtomo-staging.vercel.app,...` | CORS for staging frontend |
| `DATABASE_URI` | Auto-assigned by Railway | Separate Postgres instance |
| `REDIS_URL` | Auto-assigned by Railway | Separate Redis instance |

## Running Stress Tests Against Staging

```bash
cd tests/stress
node seed-data.js  # Seeds staging database

# Run against staging Railway directly
k6 run --env CMS_URL=https://cms-staging-d22f.up.railway.app \
       --env SSE_URL=https://sse-service-staging-c38f.up.railway.app \
       --out json=results/staging-all.json run.js

node generate-report.js results/staging-all.json
```
