import http from 'k6/http';
import { check, sleep } from 'k6';
import { searchDuration, track } from '../helpers/report.js';

/**
 * Search — tests product search performance.
 * Tests Elasticsearch path (when available) and DB fallback.
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const VUS = parseInt(__ENV.VUS) || 30;

export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '20s', target: Math.floor(VUS / 2) },
        { duration: '1m', target: VUS },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    search_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
  },
};

const SEARCH_TERMS = [
  'phone', 'laptop', 'watch', 'bag', 'shoes', 'camera',
  'headphones', 'tablet', 'keyboard', 'monitor', 'chair',
  'desk', 'test', 'vintage', 'rare', 'limited',
];

const REGIONS = ['NCR', 'Region III', 'Region IV-A', 'Region VII', ''];
const STATUSES = ['active', ''];

export default function () {
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
  const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];

  let url = `${CMS_URL}/api/products/search?q=${encodeURIComponent(term)}&limit=12`;
  if (region) url += `&region=${encodeURIComponent(region)}`;
  if (status) url += `&status=${status}`;

  const res = http.get(url, {
    tags: { name: 'GET /api/products/search' },
  });

  track(searchDuration, res);

  check(res, {
    'search 200': (r) => r.status === 200,
    'search returns results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.docs !== undefined || body.results !== undefined || body.fallback !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(Math.random() * 2 + 0.5);
}
