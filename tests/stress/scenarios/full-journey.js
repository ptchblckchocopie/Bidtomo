import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { authHeaders } from '../helpers/auth.js';
import { bidQueueDuration, productListDuration, loginDuration, track } from '../helpers/report.js';

/**
 * Full Journey — end-to-end user flow simulating a realistic session.
 * Browse → Login → Check limits → View product → Bid → Check inbox
 * Includes realistic think time between actions.
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const VUS = parseInt(__ENV.VUS) || 30;

export const options = {
  scenarios: {
    full_journey: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '30s', target: Math.floor(VUS / 2) },
        { duration: '2m', target: VUS },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
  },
};

let seedData;
try {
  seedData = JSON.parse(open('../seed-data.json'));
} catch {
  seedData = null;
}

export default function () {
  if (!seedData) return;

  const userIndex = (__VU % (seedData.users.length - 1)) + 1; // Skip user-01 (seller)
  const user = seedData.users[userIndex];
  let token = null;

  // Step 1: Browse products (unauthenticated)
  group('1_browse', () => {
    const res = http.get(`${CMS_URL}/api/products?limit=12&page=1`, {
      tags: { name: 'GET /api/products' },
    });
    track(productListDuration, res);
    check(res, { 'browse 200': (r) => r.status === 200 });
  });

  sleep(Math.random() * 2 + 1);

  // Step 2: Login
  group('2_login', () => {
    const res = http.post(
      `${CMS_URL}/api/users/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /api/users/login' },
      }
    );
    track(loginDuration, res);

    if (res.status === 200) {
      try { token = JSON.parse(res.body).token; } catch { /* ignore */ }
    }

    check(res, { 'login 200': (r) => r.status === 200 });
  });

  if (!token) return;
  sleep(Math.random() + 0.5);

  // Step 3: Check identity + limits
  group('3_identity', () => {
    http.get(`${CMS_URL}/api/users/me`, {
      headers: authHeaders(token),
      tags: { name: 'GET /api/users/me' },
    });

    const limitsRes = http.get(`${CMS_URL}/api/users/limits`, {
      headers: authHeaders(token),
      tags: { name: 'GET /api/users/limits' },
    });
    check(limitsRes, { 'limits 200': (r) => r.status === 200 });
  });

  sleep(Math.random() * 2 + 1);

  // Step 4: View a product detail
  group('4_view_product', () => {
    if (seedData.products.length === 0) return;
    const product = seedData.products[Math.floor(Math.random() * seedData.products.length)];

    const res = http.get(`${CMS_URL}/api/products/${product.id}`, {
      tags: { name: 'GET /api/products/:id' },
    });
    check(res, { 'product detail 200': (r) => r.status === 200 });
  });

  sleep(Math.random() * 3 + 2); // User reads the product page

  // Step 5: Place a bid
  group('5_bid', () => {
    if (seedData.products.length === 0) return;
    const product = seedData.products[Math.floor(Math.random() * seedData.products.length)];
    const bidAmount = product.startingPrice + product.bidInterval * (__ITER + 1) + __VU;

    const res = http.post(
      `${CMS_URL}/api/bid/queue`,
      JSON.stringify({ product: product.id, amount: bidAmount }),
      {
        headers: authHeaders(token),
        tags: { name: 'POST /api/bid/queue' },
      }
    );
    track(bidQueueDuration, res);
    check(res, {
      'bid accepted': (r) => r.status === 200 || r.status === 201,
    });
  });

  sleep(Math.random() * 2 + 1);

  // Step 6: Check inbox / messages
  group('6_inbox', () => {
    const res = http.get(`${CMS_URL}/api/messages?limit=10`, {
      headers: authHeaders(token),
      tags: { name: 'GET /api/messages' },
    });
    check(res, { 'messages 200': (r) => r.status === 200 });
  });

  sleep(Math.random() * 2 + 1);
}
