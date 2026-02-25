import http from 'k6/http';
import { check } from 'k6';

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';

/**
 * Login to the CMS and return { token, user } or null on failure.
 */
export function login(email, password) {
  const res = http.post(
    `${CMS_URL}/api/users/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/users/login' },
    }
  );

  const success = check(res, {
    'login status 200': (r) => r.status === 200,
    'login has token': (r) => {
      try { return JSON.parse(r.body).token !== undefined; } catch { return false; }
    },
  });

  if (success) {
    const body = JSON.parse(res.body);
    return { token: body.token, user: body.user };
  }
  return null;
}

/**
 * Return headers object with JWT auth for authenticated requests.
 */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `JWT ${token}`,
  };
}

/**
 * Login a pool of test users and return array of { token, user, email }.
 * Used in setup() functions for multi-user scenarios.
 */
export function loginTestUsers(count) {
  const users = [];
  for (let i = 1; i <= count; i++) {
    const email = `stresstest-user-${String(i).padStart(2, '0')}@test.com`;
    const password = 'StressTest123!';
    const result = login(email, password);
    if (result) {
      users.push({ ...result, email });
    }
  }
  return users;
}
