// Internal shared utilities for API modules

import { browser } from '$app/environment';
import { getAuthToken, authStore } from '../stores/auth';
import { goto } from '$app/navigation';

/**
 * Standardized API error with status code and user-facing message.
 * Bridge routes always return { error: string } on failure.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 500
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Extract error message from a failed bridge response.
 * Handles both { error: string } and { errors: [{ message }] } (Payload format).
 */
export async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return data.error || data.errors?.[0]?.message || data.message || fallback;
  } catch {
    return fallback;
  }
}

// Bridge API base URL - uses relative paths in browser, absolute for SSR
function getBridgeUrl(): string {
  if (browser) {
    return '';
  }
  return '';
}

export const BRIDGE_URL = getBridgeUrl();

export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `JWT ${token}`;
  }

  return headers;
}

// Handle expired/invalid token: auto-logout and redirect to login
let isLoggingOut = false;
export function handleExpiredToken() {
  if (!browser || isLoggingOut) return;
  isLoggingOut = true;
  authStore.logout();
  goto('/login');
  setTimeout(() => { isLoggingOut = false; }, 2000);
}
