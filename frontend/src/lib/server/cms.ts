// Server-side CMS bridge utility
// This file should only be imported in +server.ts files

import { env } from '$env/dynamic/private';

if (!env.CMS_URL && process.env.NODE_ENV === 'production') {
  console.error('FATAL: CMS_URL is not set in production. Frontend cannot proxy to CMS. Exiting.');
  process.exit(1);
}
const CMS_URL = env.CMS_URL || 'http://localhost:3001';

export interface CMSRequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  token?: string;
}

/** Default timeout for CMS requests (ms). Prevents bridge routes from hanging
 *  indefinitely when CMS is slow or unresponsive. Vercel functions timeout at
 *  10s (standard) / 60s (Pro), so 8s gives headroom for response. */
const DEFAULT_TIMEOUT_MS = 8_000;

export async function cmsRequest(
  endpoint: string,
  options: CMSRequestOptions = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const { method = 'GET', body, headers = {}, token } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders['Authorization'] = `JWT ${token}`;
  }

  // Abort if CMS doesn't respond within timeout
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
    keepalive: true,
    signal: controller.signal,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const url = `${CMS_URL}${endpoint}`;
  try {
    return await fetch(url, fetchOptions);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      // Return a synthetic 504 so callers handle it like any other HTTP error
      return new Response(JSON.stringify({ error: 'CMS request timed out' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function getTokenFromRequest(request: Request, cookies?: { get: (name: string) => string | undefined }): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('JWT ') || authHeader?.startsWith('Bearer ')) {
    return authHeader.startsWith('JWT ')
      ? authHeader.substring(4)
      : authHeader.substring(7);
  }

  // Fall back to httpOnly cookie via SvelteKit cookies API (most reliable)
  if (cookies) {
    const cookieToken = cookies.get('auth_token');
    if (cookieToken) return cookieToken;
  }

  // Final fallback: parse raw Cookie header
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

export function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Safe error prefixes — message must START with one of these to be shown to clients.
// This prevents leaking internal details that happen to contain a safe word.
const SAFE_PREFIXES = [
  'unauthorized', 'forbidden', 'not found', 'invalid', 'required',
  'already exists', 'already registered', 'already reported',
  'too many', 'limit exceeded', 'expired', 'failed to',
  'must be', 'cannot', 'csrf', 'password must', 'email already',
  'email is', 'name is', 'title is', 'description is', 'price is',
  'you must', 'you cannot', 'you are not', 'bid must', 'auction',
  'product', 'no active', 'this product', 'the following',
  'please ', 'missing ', 'duplicate', 'value is',
];

function isSafeMessage(msg: string): boolean {
  // Reject long messages — likely stack traces or internal errors
  if (msg.length > 150) return false;
  const lower = msg.toLowerCase();
  return SAFE_PREFIXES.some(prefix => lower.startsWith(prefix));
}

const GENERIC_ERRORS: Record<number, string> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Not found',
  409: 'Conflict',
  429: 'Too many requests',
  500: 'Something went wrong',
};

export function errorResponse(message: string, status = 500): Response {
  // Only expose known-safe messages to the client; hide internal details
  const clientMessage = isSafeMessage(message) ? message : (GENERIC_ERRORS[status] || 'Something went wrong');
  return jsonResponse({ error: clientMessage }, status);
}

/**
 * Sanitize query params before forwarding to CMS.
 * Blocks where[] queries targeting sensitive/PII fields and caps depth
 * to prevent data exfiltration via the bridge proxy.
 * Allows legitimate where[] filters (product, status, seller, etc.).
 *
 * @param incoming - raw URLSearchParams from the browser request
 * @param opts.maxDepth - maximum allowed depth (default 2)
 */
export function sanitizeQueryParams(
  incoming: URLSearchParams,
  opts: { maxDepth?: number } = {}
): URLSearchParams {
  const { maxDepth = 2 } = opts;
  const safe = new URLSearchParams();

  // Block where[] targeting PII or auth fields
  const blockedFields = /\b(email|password|hash|salt|phonenumber|countrycode|token|secret|resetpassword)\b/i;

  incoming.forEach((value, key) => {
    const keyLower = key.toLowerCase();

    // Block where queries on sensitive fields
    if (keyLower.startsWith('where[') || keyLower === 'where') {
      if (blockedFields.test(keyLower)) return;
    }

    // Cap depth
    if (keyLower === 'depth') {
      const d = parseInt(value, 10);
      safe.set('depth', String(Math.min(isNaN(d) ? 1 : d, maxDepth)));
      return;
    }

    // Block limit above 1000 to prevent data dumps
    if (keyLower === 'limit') {
      const l = parseInt(value, 10);
      safe.set('limit', String(Math.min(isNaN(l) ? 10 : l, 1000)));
      return;
    }

    safe.append(key, value);
  });

  return safe;
}

export { CMS_URL };
