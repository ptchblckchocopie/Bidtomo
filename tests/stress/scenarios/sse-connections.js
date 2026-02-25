import http from 'k6/http';
import { check, sleep } from 'k6';
import { openSSE, getSSEHealth } from '../helpers/sse.js';
import { sseConnectDuration, sseConnectionCount, track } from '../helpers/report.js';

/**
 * SSE Connections — tests SSE connection limits and stability.
 * Ramps up concurrent SSE connections while monitoring the health endpoint.
 * k6 opens HTTP connections with Accept: text/event-stream and long timeouts.
 */

const SSE_URL = __ENV.SSE_URL || 'http://localhost:3002';
const MAX_CONNECTIONS = parseInt(__ENV.VUS) || 200;

export const options = {
  scenarios: {
    // Ramp up SSE connections
    sse_ramp: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: MAX_CONNECTIONS },
        { duration: '1m', target: MAX_CONNECTIONS }, // Hold at peak
        { duration: '30s', target: 0 },
      ],
      exec: 'sseConnect',
    },
    // Monitor health endpoint during the test
    health_monitor: {
      executor: 'constant-arrival-rate',
      rate: 2, // 2 requests per second
      timeUnit: '1s',
      duration: '3m30s',
      preAllocatedVUs: 2,
      exec: 'monitorHealth',
    },
  },
  thresholds: {
    'http_req_failed{type:sse}': ['rate<0.10'],
    sse_connect_duration: ['p(95)<200'],
  },
};

let seedData;
try {
  seedData = JSON.parse(open('../seed-data.json'));
} catch {
  seedData = null;
}

// Each VU opens an SSE connection and holds it
export function sseConnect() {
  const endpoints = ['/events/global'];

  // Add product-specific endpoints if seed data available
  if (seedData && seedData.products.length > 0) {
    const product = seedData.products[__VU % seedData.products.length];
    endpoints.push(`/events/products/${product.id}`);
  }

  const endpoint = endpoints[__VU % endpoints.length];

  // Hold connection for 15 seconds (enough to receive a heartbeat)
  const res = openSSE(endpoint, 15000);
  track(sseConnectDuration, res);
  sseConnectionCount.add(1);

  check(res, {
    'SSE connection OK': (r) => r.status === 200 || r.status === 0, // 0 = timeout (expected for long-lived)
  });

  sleep(1);
}

// Periodically check SSE health to track connection counts
export function monitorHealth() {
  const health = getSSEHealth();

  if (health) {
    // Log connection counts at intervals
    if (__ITER % 10 === 0) {
      console.log(
        `[SSE Health] total=${health.totalConnections || 'N/A'} ` +
        `product=${health.productConnections || 'N/A'} ` +
        `user=${health.userConnections || 'N/A'} ` +
        `global=${health.globalConnections || 'N/A'} ` +
        `redis=${health.redis || 'N/A'}`
      );
    }
  }
}
