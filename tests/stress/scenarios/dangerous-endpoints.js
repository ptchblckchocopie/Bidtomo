import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { dangerousEndpointDuration, track } from '../helpers/report.js';

/**
 * Dangerous Endpoints — tests unauthenticated endpoints that have N+1 query patterns.
 * Purpose: prove these endpoints need auth and rate limiting.
 *
 * WARNING: These endpoints can put significant load on the database.
 * Run with low VU counts and short durations.
 *
 * Endpoints tested:
 * - POST /api/create-conversations (no auth, N+1 over all sold products)
 * - POST /api/sync-bids (no auth, fetches 1000 bids, writes to each product)
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const VUS = parseInt(__ENV.VUS) || 10; // Keep low — these are heavy

export const options = {
  scenarios: {
    dangerous: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '15s', target: 5 },
        { duration: '30s', target: VUS },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    // These are expected to be slow — thresholds are lenient to capture data
    dangerous_endpoint_duration: ['p(50)<10000'],
    http_req_failed: ['rate<0.30'], // High error rate expected
  },
};

export default function () {
  // Test /api/create-conversations
  group('create_conversations', () => {
    const res = http.post(
      `${CMS_URL}/api/create-conversations`,
      '{}',
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /api/create-conversations' },
        timeout: '30s',
      }
    );

    track(dangerousEndpointDuration, res);

    check(res, {
      'create-conversations responds': (r) => r.status !== 0,
    });

    // Log the response time prominently
    if (__ITER === 0) {
      console.log(
        `[DANGEROUS] POST /api/create-conversations: ` +
        `status=${res.status} duration=${res.timings.duration}ms`
      );
    }
  });

  sleep(2); // Breathe between heavy endpoints

  // Test /api/sync-bids
  group('sync_bids', () => {
    const res = http.post(
      `${CMS_URL}/api/sync-bids`,
      '{}',
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /api/sync-bids' },
        timeout: '30s',
      }
    );

    track(dangerousEndpointDuration, res);

    check(res, {
      'sync-bids responds': (r) => r.status !== 0,
    });

    if (__ITER === 0) {
      console.log(
        `[DANGEROUS] POST /api/sync-bids: ` +
        `status=${res.status} duration=${res.timings.duration}ms`
      );
    }
  });

  sleep(3);
}
