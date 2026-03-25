// Server-side CMS bridge utility
// This file should only be imported in +server.ts files

import { env } from '$env/dynamic/private';

const CMS_URL = env.CMS_URL || 'http://localhost:3001';

export interface CMSRequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  token?: string;
}

export async function cmsRequest(
  endpoint: string,
  options: CMSRequestOptions = {}
): Promise<Response> {
  const { method = 'GET', body, headers = {}, token } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    requestHeaders['Authorization'] = `JWT ${token}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const url = `${CMS_URL}${endpoint}`;
  return fetch(url, fetchOptions);
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

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
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
