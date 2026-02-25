import http from 'k6/http';
import { check } from 'k6';

const SSE_URL = __ENV.SSE_URL || 'http://localhost:3002';

/**
 * Open an SSE connection and hold it for the specified duration.
 * k6 doesn't natively parse SSE frames, but this measures:
 * - Connection establishment success
 * - Time-to-first-byte
 * - Whether the server keeps the connection alive
 *
 * @param {string} path - SSE endpoint path (e.g., '/events/global')
 * @param {number} timeoutMs - How long to hold the connection (default 10s)
 * @param {object} extraTags - Additional k6 tags
 * @returns {object} k6 response
 */
export function openSSE(path, timeoutMs = 10000, extraTags = {}) {
  const res = http.get(`${SSE_URL}${path}`, {
    timeout: `${timeoutMs}ms`,
    tags: { name: `SSE ${path}`, type: 'sse', ...extraTags },
    headers: {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });

  check(res, {
    'SSE connection established': (r) => r.status === 200,
    'SSE content type correct': (r) =>
      (r.headers['Content-Type'] || '').includes('text/event-stream'),
  });

  return res;
}

/**
 * Poll the SSE service health endpoint to get connection counts.
 * @returns {object|null} { productConnections, userConnections, globalConnections, totalConnections, redis }
 */
export function getSSEHealth() {
  const res = http.get(`${SSE_URL}/health`, {
    tags: { name: 'GET /health (SSE)' },
  });

  if (res.status === 200) {
    try {
      return JSON.parse(res.body);
    } catch {
      return null;
    }
  }
  return null;
}
