# Start Local Dev — All Services

Start all Bidmoto services locally for development.

## Step 1: Ask the user which infrastructure mode to use

Present these options and wait for their answer:
1. **Cloud (Neon + Upstash)** — No Docker needed. Uses cloud PostgreSQL and Redis.
2. **Docker** — Uses local Docker containers for PostgreSQL and Redis.
3. **Frontend only** — Just the SvelteKit frontend, pointed at the staging backend. No CMS/SSE/worker.

## Step 1.5: Check for .env files (first-time setup)

Check if `cms/.env` and `frontend/.env` exist. If either is missing, this is a new team member.

**If `cms/.env` is missing**, create it with the shared Cloud config:
```
PAYLOAD_SECRET=local-dev-secret-make-it-long-and-random-1234567890

# === Database ===
# Option 1: Neon (cloud PostgreSQL, no Docker needed)
DATABASE_URI=postgresql://neondb_owner:npg_R7JZiQhVbO3c@ep-proud-rain-a12lbbp0-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
# Option 2: Local Docker
# DATABASE_URI=postgresql://postgres:postgres@localhost:5433/marketplace

# === Redis ===
# Option 1: Upstash (cloud Redis, no Docker needed)
REDIS_URL=rediss://default:gQAAAAAAAUsHAAIncDFhMzdmMDdlZjgxOWE0YWE0OTMyMzZjNTNhZjFhMWM0N3AxODQ3NDM@golden-mole-84743.upstash.io:6379
# Option 2: Local Docker Redis
# REDIS_URL=redis://:localdev@localhost:6380
# Option 3: No Redis
# REDIS_URL=

FRONTEND_URL=http://localhost:5173
SERVER_URL=http://localhost:3001
PORT=3001
NODE_ENV=development
BACKUP_ENABLED=false
SENTRY_DSN=
```

**If `frontend/.env` is missing**, create it:
```
CMS_URL=http://localhost:3001
PUBLIC_SSE_URL=http://localhost:3002
PUBLIC_SENTRY_ENVIRONMENT=development
```

Tell the user these files were created automatically with the shared team database.

## Step 2: Configure environment based on choice

### If Cloud (Neon + Upstash):
- Read `cms/.env` and ensure the Neon `DATABASE_URI` line is uncommented and the Docker one is commented out.
- Ensure the Upstash `REDIS_URL` line is uncommented and the Docker one is commented out.
- Set the same `REDIS_URL` and `DATABASE_URL` (same value as `DATABASE_URI`) and `PAYLOAD_SECRET` as environment variables for the SSE and bid-worker services when starting them.
- Do NOT start Docker.

### If Docker:
- Read `cms/.env` and ensure the Docker `DATABASE_URI` line is uncommented and the Neon one is commented out.
- Ensure the Docker `REDIS_URL` line is uncommented and the Upstash one is commented out.
- Run `docker compose -f docker-compose.local.yml up -d` and wait for containers to be healthy.
- SSE and bid-worker use `REDIS_URL=redis://:localdev@localhost:6380`, `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/marketplace`.

### If Frontend only:
- Edit `frontend/.env` to:
  ```
  CMS_URL=https://staging.188-166-216-176.sslip.io
  PUBLIC_SSE_URL=https://staging.188-166-216-176.sslip.io/sse
  ```
- Skip to Step 4 (only start frontend).

## Step 3: Install dependencies

Check each service directory for `node_modules/`. If missing, run `npm install` in that directory. Do these in parallel:
- `frontend/`
- `cms/`
- `services/sse-service/`
- `services/bid-worker/`

## Step 4: Start services

Start each service in the background using Bash with `run_in_background`. Read the `PAYLOAD_SECRET` from `cms/.env` so all services share the same value.

For **Cloud** or **Docker** mode, start all four:
1. **CMS** — `cd E:/Bidmoto/cms && npm run dev` (port 3001)
2. **SSE Service** — `cd E:/Bidmoto/services/sse-service && REDIS_URL=<value> PAYLOAD_SECRET=<value> npx ts-node src/index.ts` (port 3002)
3. **Bid Worker** — `cd E:/Bidmoto/services/bid-worker && REDIS_URL=<value> DATABASE_URL=<value> PAYLOAD_SECRET=<value> npx ts-node src/index.ts` (port 3001's DB)
4. **Frontend** — `cd E:/Bidmoto/frontend && npm run dev` (port 5173)

For **Frontend only** mode:
1. **Frontend** — `cd E:/Bidmoto/frontend && npm run dev` (port 5173)

## Step 5: Confirm

Print a summary with clear links:

```
Mode: Cloud (Neon + Upstash) | Docker | Frontend-only

Frontend:   http://localhost:5173
CMS Admin:  http://localhost:3001/admin
CMS API:    http://localhost:3001/api
SSE:        http://localhost:3002

Shared database — all team members on Cloud mode share the same data.
Use /project:switch-db to toggle between Cloud and Docker.
```

Only show CMS/SSE lines if those services were started (not in Frontend-only mode).
