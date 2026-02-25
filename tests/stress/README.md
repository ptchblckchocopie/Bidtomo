# Bidmo.to Stress Testing Suite

k6-based stress testing for the Bidmo.to auction marketplace.

## Setup

1. Install k6: https://k6.io/docs/get-started/installation/
2. Start the app: `docker-compose up -d` (from repo root)
3. Seed test data:
   ```bash
   cd tests/stress
   npm install
   node seed-data.js
   ```

## Running Tests

```bash
# Smoke test first
k6 run --env CMS_URL=http://localhost:3001 scenarios/smoke.js

# Individual scenario
k6 run --env CMS_URL=http://localhost:3001 --out json=results/bid-storm.json scenarios/bid-storm.js

# All scenarios (~7 min)
k6 run --env CMS_URL=http://localhost:3001 --out json=results/all.json run.js

# Generate report
node generate-report.js results/all.json
```

## Scenarios

- **smoke.js** — Health check gate (run first)
- **bid-storm.js** — Concurrent bidding on same product (critical path)
- **browse-journey.js** — Product listing, detail views, pagination
- **auth-flow.js** — Login throughput + /users/limits bottleneck
- **full-journey.js** — End-to-end user session
- **sse-connections.js** — SSE connection limit testing
- **dangerous-endpoints.js** — Unauthenticated endpoint abuse testing
- **search.js** — Product search performance

## Architecture

- `helpers/auth.js` — JWT login for k6 scripts
- `helpers/sse.js` — SSE connection wrapper
- `helpers/report.js` — Custom k6 metrics
- `seed-data.js` — Creates test users + products
- `generate-report.js` — Parses k6 JSON → formatted report
- `sse-load.js` — Node.js EventSource load generator (companion to k6)
- `run.js` — Orchestrates all scenarios in sequence
- `docker-compose.stress.yml` — k6 + InfluxDB + Grafana stack

## Cleanup

```bash
node seed-data.js --cleanup
```
