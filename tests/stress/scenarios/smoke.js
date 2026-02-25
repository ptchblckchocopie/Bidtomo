import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Smoke Test — verify all services are up before running heavier tests.
 * 1-2 VUs, 30 seconds. Should be run first as a gate check.
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const SSE_URL = __ENV.SSE_URL || 'http://localhost:3002';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  // CMS root
  const cmsRoot = http.get(`${CMS_URL}/`, {
    tags: { name: 'GET / (CMS root)' },
  });
  check(cmsRoot, {
    'CMS root responds': (r) => r.status === 200,
  });

  // CMS health
  const cmsHealth = http.get(`${CMS_URL}/api/health`, {
    tags: { name: 'GET /api/health' },
  });
  check(cmsHealth, {
    'CMS health 200': (r) => r.status === 200,
    'Redis connected': (r) => {
      try {
        return JSON.parse(r.body).redis !== 'disconnected';
      } catch {
        return false;
      }
    },
  });

  // SSE health
  const sseHealth = http.get(`${SSE_URL}/health`, {
    tags: { name: 'GET /health (SSE)' },
  });
  check(sseHealth, {
    'SSE health 200': (r) => r.status === 200,
  });

  // Products endpoint (basic read)
  const products = http.get(`${CMS_URL}/api/products?limit=1`, {
    tags: { name: 'GET /api/products (smoke)' },
  });
  check(products, {
    'Products endpoint responds': (r) => r.status === 200,
  });

  sleep(2);
}
