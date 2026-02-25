import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { login, authHeaders } from '../helpers/auth.js';
import { loginDuration, userLimitsDuration, track } from '../helpers/report.js';

/**
 * Auth Flow — tests authentication throughput and the /users/limits bottleneck.
 * /users/limits runs 3 sequential Payload queries with no caching — known bottleneck.
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const VUS = parseInt(__ENV.VUS) || 50;

export const options = {
  scenarios: {
    auth_pressure: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: Math.floor(VUS / 2) },
        { duration: '1m', target: VUS },
        { duration: '1m', target: VUS },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    login_duration: ['p(95)<600', 'p(99)<1200'],
    user_limits_duration: ['p(95)<800', 'p(99)<2000'],
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
  if (!seedData) {
    console.error('seed-data.json not found');
    return;
  }

  // Pick a user for this VU
  const userIndex = __VU % seedData.users.length;
  const user = seedData.users[userIndex];

  // Login
  group('login', () => {
    const res = http.post(
      `${CMS_URL}/api/users/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /api/users/login' },
      }
    );

    track(loginDuration, res);

    const success = check(res, {
      'login 200': (r) => r.status === 200,
      'has token': (r) => {
        try { return JSON.parse(r.body).token !== undefined; } catch { return false; }
      },
    });

    if (!success) return;

    const token = JSON.parse(res.body).token;

    sleep(0.5);

    // /users/me — token validation
    group('me', () => {
      const meRes = http.get(`${CMS_URL}/api/users/me`, {
        headers: authHeaders(token),
        tags: { name: 'GET /api/users/me' },
      });

      check(meRes, {
        '/me responds 200': (r) => r.status === 200,
      });
    });

    sleep(0.3);

    // /users/limits — the bottleneck (3 sequential queries)
    group('limits', () => {
      const limitsRes = http.get(`${CMS_URL}/api/users/limits`, {
        headers: authHeaders(token),
        tags: { name: 'GET /api/users/limits' },
      });

      track(userLimitsDuration, limitsRes);

      check(limitsRes, {
        '/limits responds 200': (r) => r.status === 200,
        '/limits has data': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.bidLimit !== undefined || body.postLimit !== undefined;
          } catch { return false; }
        },
      });
    });

    sleep(1);

    // Hit /users/limits again (simulates user navigating around the app)
    group('limits_repeat', () => {
      const limitsRes2 = http.get(`${CMS_URL}/api/users/limits`, {
        headers: authHeaders(token),
        tags: { name: 'GET /api/users/limits' },
      });

      track(userLimitsDuration, limitsRes2);

      check(limitsRes2, {
        '/limits repeat 200': (r) => r.status === 200,
      });
    });
  });

  sleep(Math.random() * 2 + 1);
}
