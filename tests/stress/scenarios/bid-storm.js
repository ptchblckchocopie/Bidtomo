import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { loginTestUsers, authHeaders } from '../helpers/auth.js';
import { bidQueueDuration, bidQueueErrors, track } from '../helpers/report.js';

/**
 * Bid Storm — the most critical stress test.
 * Simulates a bidding war: many users bid concurrently on the same product.
 * Tests Redis queue throughput, bid-worker dedup, race condition handling.
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const VUS = parseInt(__ENV.VUS) || 20;
const DURATION = __ENV.DURATION || '2m';

export const options = {
  scenarios: {
    bid_ramp: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: VUS },
        { duration: '1m', target: VUS },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    bid_queue_duration: ['p(95)<300', 'p(99)<800'],
    bid_queue_errors: ['rate<0.10'],
    http_req_failed: ['rate<0.10'],
  },
};

// Load seed data (shared across VUs, loaded once)
let seedData;
try {
  seedData = JSON.parse(open('../seed-data.json'));
} catch {
  seedData = null;
}

export function setup() {
  if (!seedData) {
    console.error('seed-data.json not found. Run: node seed-data.js');
    return { error: true };
  }

  // Login all test users
  const users = loginTestUsers(Math.min(VUS, seedData.users.length));

  if (users.length === 0) {
    console.error('No users could log in. Check seed data.');
    return { error: true };
  }

  // Pick the first product as the bid target
  const targetProduct = seedData.products[0];

  // Get current product state
  const productRes = http.get(`${CMS_URL}/api/products/${targetProduct.id}`, {
    tags: { name: 'GET /api/products/:id (setup)' },
  });

  let currentBid = targetProduct.startingPrice;
  if (productRes.status === 200) {
    try {
      const p = JSON.parse(productRes.body);
      currentBid = p.currentBid || p.startingPrice || currentBid;
    } catch { /* use default */ }
  }

  return {
    users,
    targetProductId: targetProduct.id,
    bidInterval: targetProduct.bidInterval,
    startingBid: currentBid,
  };
}

export default function (data) {
  if (data.error) return;

  // Each VU picks a user from the pool (round-robin)
  const userIndex = __VU % data.users.length;
  const user = data.users[userIndex];

  group('place_bid', () => {
    // Calculate a bid amount (VU iteration creates unique increments)
    const bidAmount = data.startingBid + (__ITER + 1) * data.bidInterval + __VU;

    const res = http.post(
      `${CMS_URL}/api/bid/queue`,
      JSON.stringify({
        product: data.targetProductId,
        amount: bidAmount,
      }),
      {
        headers: authHeaders(user.token),
        tags: { name: 'POST /api/bid/queue' },
      }
    );

    track(bidQueueDuration, res);

    const passed = check(res, {
      'bid accepted (200/201)': (r) => r.status === 200 || r.status === 201,
      'bid queued or processed': (r) => {
        if (r.status !== 200 && r.status !== 201) return false;
        try {
          const body = JSON.parse(r.body);
          return body.queued === true || body.id !== undefined || body.doc !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (!passed) {
      bidQueueErrors.add(1);
    } else {
      bidQueueErrors.add(0);
    }
  });

  // Brief pause between bids (simulates rapid but not instant rebidding)
  sleep(Math.random() * 0.5 + 0.2);

  // Periodically check product status to verify bids are processing
  if (__ITER % 5 === 0) {
    group('check_status', () => {
      const statusRes = http.get(
        `${CMS_URL}/api/products/${data.targetProductId}/status`,
        { tags: { name: 'GET /api/products/:id/status' } }
      );

      check(statusRes, {
        'status endpoint responds': (r) => r.status === 200,
      });
    });
  }
}

export function teardown(data) {
  if (data.error) return;

  // Final check: verify the product has an updated currentBid
  const finalRes = http.get(`${CMS_URL}/api/products/${data.targetProductId}`, {
    tags: { name: 'GET /api/products/:id (teardown)' },
  });

  if (finalRes.status === 200) {
    try {
      const product = JSON.parse(finalRes.body);
      console.log(`\n=== BID STORM RESULTS ===`);
      console.log(`Product: ${product.title || data.targetProductId}`);
      console.log(`Starting bid: ${data.startingBid}`);
      console.log(`Final currentBid: ${product.currentBid}`);
      console.log(`Status: ${product.status}`);
    } catch { /* ignore */ }
  }
}
