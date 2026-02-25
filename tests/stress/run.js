import { sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

// Import all scenarios
import { default as smokeTest, options as smokeOptions } from './scenarios/smoke.js';
import { default as browseTest } from './scenarios/browse-journey.js';
import { default as bidStormTest, setup as bidStormSetup, teardown as bidStormTeardown } from './scenarios/bid-storm.js';
import { default as authTest } from './scenarios/auth-flow.js';
import { default as fullJourneyTest } from './scenarios/full-journey.js';
import { default as searchTest } from './scenarios/search.js';

/**
 * Orchestrator — runs key scenarios in sequence.
 * Excludes dangerous-endpoints.js and sse-connections.js (run manually).
 *
 * Usage:
 *   k6 run --env CMS_URL=http://localhost:3001 --out json=results/all.json run.js
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const SSE_URL = __ENV.SSE_URL || 'http://localhost:3002';

export const options = {
  scenarios: {
    // Phase 1: Smoke test (gates everything)
    smoke: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 3,
      exec: 'smoke',
      startTime: '0s',
    },
    // Phase 2: Browse (read-heavy)
    browse: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '20s', target: 25 },
        { duration: '40s', target: 50 },
        { duration: '20s', target: 0 },
      ],
      exec: 'browse',
      startTime: '15s', // After smoke
    },
    // Phase 3: Auth flow
    auth: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '20s', target: 25 },
        { duration: '40s', target: 50 },
        { duration: '20s', target: 0 },
      ],
      exec: 'auth',
      startTime: '1m35s', // After browse
    },
    // Phase 4: Bid storm
    bid_storm: {
      executor: 'ramping-vus',
      startVUs: 3,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '40s', target: 15 },
        { duration: '20s', target: 0 },
      ],
      exec: 'bidStorm',
      startTime: '2m55s', // After auth
    },
    // Phase 5: Full journey (mixed)
    full_journey: {
      executor: 'ramping-vus',
      startVUs: 3,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '1m', target: 30 },
        { duration: '20s', target: 0 },
      ],
      exec: 'fullJourney',
      startTime: '4m15s', // After bid storm
    },
    // Phase 6: Search
    search: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '15s', target: 20 },
        { duration: '30s', target: 30 },
        { duration: '15s', target: 0 },
      ],
      exec: 'search',
      startTime: '5m55s', // After full journey
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
  },
};

export function smoke() {
  smokeTest();
}

export function browse() {
  browseTest();
}

export function auth() {
  authTest();
}

export function bidStorm() {
  bidStormTest(bidStormSetup());
}

export function fullJourney() {
  fullJourneyTest();
}

export function search() {
  searchTest();
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
