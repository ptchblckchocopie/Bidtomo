#!/usr/bin/env node

/**
 * Report Generator — parses k6 JSON output and produces a structured report.
 *
 * Usage:
 *   node generate-report.js results/all.json
 *   node generate-report.js results/bid-storm.json --json
 *
 * Output:
 *   - Console: formatted summary table
 *   - File: results/report-{timestamp}.json
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];
const outputJson = process.argv.includes('--json');

if (!inputFile) {
  console.error('Usage: node generate-report.js <k6-output.json> [--json]');
  console.error('  Run k6 with: --out json=results/output.json');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`File not found: ${inputFile}`);
  process.exit(1);
}

// Parse k6 JSON output (newline-delimited JSON)
const lines = fs.readFileSync(inputFile, 'utf-8').trim().split('\n');
const metrics = {};
const points = [];

for (const line of lines) {
  try {
    const entry = JSON.parse(line);
    if (entry.type === 'Point') {
      points.push(entry);

      const name = entry.metric;
      const tags = entry.data?.tags || {};
      const value = entry.data?.value;

      // Group by endpoint name tag
      const endpointName = tags.name || 'unknown';
      const key = `${name}::${endpointName}`;

      if (!metrics[key]) {
        metrics[key] = {
          metric: name,
          endpoint: endpointName,
          values: [],
          tags,
        };
      }
      if (value !== undefined) {
        metrics[key].values.push(value);
      }
    }
  } catch { /* skip non-JSON lines */ }
}

// Calculate percentiles
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Build endpoint performance table
const endpointMetrics = {};

for (const [key, data] of Object.entries(metrics)) {
  if (data.metric !== 'http_req_duration') continue;
  const ep = data.endpoint;
  if (ep === 'unknown') continue;

  endpointMetrics[ep] = {
    endpoint: ep,
    p50: Math.round(percentile(data.values, 50)),
    p95: Math.round(percentile(data.values, 95)),
    p99: Math.round(percentile(data.values, 99)),
    mean: Math.round(mean(data.values)),
    count: data.values.length,
    min: Math.round(Math.min(...data.values)),
    max: Math.round(Math.max(...data.values)),
  };
}

// Calculate error rates per endpoint
for (const [key, data] of Object.entries(metrics)) {
  if (data.metric !== 'http_req_failed') continue;
  const ep = data.endpoint;
  if (endpointMetrics[ep]) {
    const failures = data.values.filter((v) => v === 1).length;
    endpointMetrics[ep].errorRate = data.values.length > 0
      ? (failures / data.values.length * 100).toFixed(1)
      : '0.0';
  }
}

// Determine test duration
let minTime = Infinity;
let maxTime = 0;
for (const point of points) {
  const t = new Date(point.data?.time).getTime();
  if (t && t < minTime) minTime = t;
  if (t && t > maxTime) maxTime = t;
}
const durationS = Math.round((maxTime - minTime) / 1000) || 0;

// Find bottlenecks (p95 > 500ms)
const bottlenecks = Object.values(endpointMetrics)
  .filter((ep) => ep.p95 > 500)
  .sort((a, b) => b.p95 - a.p95);

// Calculate capacity estimate (VU count where p95 first exceeds 500ms)
const totalRequests = Object.values(endpointMetrics).reduce((sum, ep) => sum + ep.count, 0);
const reqsPerSec = durationS > 0 ? (totalRequests / durationS).toFixed(1) : 'N/A';

// Build report
const report = {
  metadata: {
    timestamp: new Date().toISOString(),
    inputFile,
    durationSeconds: durationS,
    totalRequests,
    requestsPerSecond: parseFloat(reqsPerSec) || 0,
  },
  endpoints: Object.values(endpointMetrics).sort((a, b) => b.count - a.count),
  bottlenecks: bottlenecks.map((b) => ({
    endpoint: b.endpoint,
    p95: b.p95,
    p99: b.p99,
    errorRate: b.errorRate || '0.0',
    recommendation: getRecommendation(b.endpoint),
  })),
};

function getRecommendation(endpoint) {
  const recs = {
    'GET /api/users/limits': 'Add Redis cache (TTL 30s) or aggregate in single raw SQL query',
    'POST /api/create-conversations': 'Add auth guard (admin-only) + batch query. Currently no auth.',
    'POST /api/sync-bids': 'Add auth guard (admin-only) + rate limit. Currently no auth.',
    'POST /api/bid/queue': 'Monitor Redis queue depth. Consider horizontal scaling of bid-worker.',
    'GET /api/products/search': 'Ensure Elasticsearch is healthy. DB fallback is significantly slower.',
  };
  return recs[endpoint] || 'Investigate query patterns and add caching or indexing.';
}

// Console output
console.log('\n' + '='.repeat(60));
console.log('  BIDMO.TO STRESS TEST REPORT');
console.log('='.repeat(60));
console.log(`Date:     ${report.metadata.timestamp}`);
console.log(`Duration: ${durationS}s`);
console.log(`Total:    ${totalRequests} requests (${reqsPerSec} req/s)`);
console.log(`Source:   ${inputFile}`);

console.log('\n--- ENDPOINT PERFORMANCE ---');
console.log(
  'Endpoint'.padEnd(38) +
  'p50'.padStart(7) +
  'p95'.padStart(7) +
  'p99'.padStart(7) +
  'Err%'.padStart(7) +
  'Count'.padStart(8)
);
console.log('-'.repeat(74));

for (const ep of report.endpoints) {
  const isBottleneck = ep.p95 > 500;
  const flag = isBottleneck ? ' <<<' : '';
  console.log(
    ep.endpoint.padEnd(38) +
    `${ep.p50}ms`.padStart(7) +
    `${ep.p95}ms`.padStart(7) +
    `${ep.p99}ms`.padStart(7) +
    `${ep.errorRate || '0.0'}%`.padStart(7) +
    `${ep.count}`.padStart(8) +
    flag
  );
}

if (bottlenecks.length > 0) {
  console.log('\n--- BOTTLENECK ANALYSIS ---');
  bottlenecks.forEach((b, i) => {
    console.log(`${i + 1}. ${b.endpoint} — p95=${b.p95}ms, p99=${b.p99}ms, err=${b.errorRate || '0.0'}%`);
    console.log(`   RECOMMENDATION: ${getRecommendation(b.endpoint)}`);
  });
} else {
  console.log('\n--- No bottlenecks detected (all endpoints p95 < 500ms) ---');
}

console.log('\n' + '='.repeat(60));

// Write JSON report
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputPath = path.join(__dirname, 'results', `report-${timestamp}.json`);

// Ensure results directory exists
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`\nJSON report saved to: ${outputPath}`);

if (outputJson) {
  console.log('\n' + JSON.stringify(report, null, 2));
}
