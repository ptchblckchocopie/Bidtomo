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

export function getTokenFromRequest(request: Request): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('JWT ') || authHeader?.startsWith('Bearer ')) {
    return authHeader.startsWith('JWT ')
      ? authHeader.substring(4)
      : authHeader.substring(7);
  }

  // Fall back to httpOnly cookie
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

export { CMS_URL };
