# Stress Test Guide

Run and interpret stress tests for the Bidmo.to platform using k6.

## Prerequisites
- Docker and Docker Compose running (`docker-compose up -d` from repo root)
- OR: k6 installed locally (`brew install k6` / `choco install k6` / `winget install k6`)
- Seed data created: `cd tests/stress && npm install && node seed-data.js`

## Quick Start

```bash
# 1. Seed test data (20 users + 10 products)
cd tests/stress
npm install
node seed-data.js

# 2. Smoke test (verify services are up)
k6 run --env CMS_URL=http://localhost:3001 --env SSE_URL=http://localhost:3002 scenarios/smoke.js

# 3. Run a specific scenario
k6 run --env CMS_URL=http://localhost:3001 --out json=results/bid-storm.json scenarios/bid-storm.js

# 4. Run all scenarios (orchestrated, ~7 minutes)
k6 run --env CMS_URL=http://localhost:3001 --env SSE_URL=http://localhost:3002 --out json=results/all.json run.js

# 5. Generate report from results
node generate-report.js results/all.json
```

## Docker-Based (with Grafana Dashboard)

```bash
cd tests/stress
docker compose -f ../../docker-compose.yml -f docker-compose.stress.yml up -d influxdb grafana
docker compose -f ../../docker-compose.yml -f docker-compose.stress.yml run k6 run /scripts/scenarios/bid-storm.js
# Dashboard at http://localhost:3030
```

## Scenarios

| Scenario | File | What it tests | VUs | Duration |
|----------|------|---------------|-----|----------|
| Smoke | `smoke.js` | Service health gate | 1 | 30s |
| Browse | `browse-journey.js` | Product listing + detail + pagination | 10→100 | 3m |
| Bid Storm | `bid-storm.js` | Concurrent bidding race conditions | 5→50 | 2m |
| Auth Flow | `auth-flow.js` | Login + JWT + /users/limits bottleneck | 10→100 | 3m |
| SSE | `sse-connections.js` | Long-lived SSE connection limits | 10→500 | 3.5m |
| Full Journey | `full-journey.js` | Browse→login→bid→inbox end-to-end | 5→60 | 3m |
| Dangerous | `dangerous-endpoints.js` | Unauthenticated N+1 endpoints | 2→10 | 1m |
| Search | `search.js` | Elasticsearch + DB fallback | 5→30 | 1.5m |
| **All** | `run.js` | Orchestrated sequence of above | varies | ~7m |

## SSE Load Testing (Node.js companion)

k6 can't fully parse SSE streams. Use the companion script for event verification:
```bash
SSE_URL=http://localhost:3002 CONNECTIONS=100 DURATION_S=60 node sse-load.js
```

## Interpreting Results

### Key Metrics
- **`p95 < 500ms`** = healthy endpoint
- **`p95 500ms-1s`** = degrading, investigate
- **`p95 > 1s`** = bottleneck, needs optimization
- **`error rate > 5%`** = service overloaded

### Known Bottlenecks
- **`GET /api/users/limits`** — 3 sequential Payload queries, no caching. Will degrade first under load.
- **`POST /api/create-conversations`** — N+1 over all sold products, **no auth guard**.
- **`POST /api/sync-bids`** — Fetches 1000 bids, writes each product, **no auth guard**.
- **SSE connections** — Plateau depends on OS `ulimit -n` setting on SSE service container.

### Report Output
The `generate-report.js` script produces:
- Console table: endpoint × p50/p95/p99/error%/count
- Bottleneck analysis with recommendations
- JSON file at `tests/stress/results/report-{timestamp}.json`

## Environment Variables
- `CMS_URL` — CMS backend (default: `http://localhost:3001`)
- `SSE_URL` — SSE service (default: `http://localhost:3002`)
- `VUS` — Override VU count for any scenario
- `DURATION` — Override duration (e.g., `5m`)

## Cleanup
```bash
node seed-data.js --cleanup
docker compose -f docker-compose.stress.yml down -v
```
