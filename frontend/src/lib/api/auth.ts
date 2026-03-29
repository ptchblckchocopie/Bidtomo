import { BRIDGE_URL, getAuthHeaders, handleExpiredToken } from './_shared';
import { trackLogin, trackLoginFailed, trackLogout } from '../analytics';
import * as Sentry from '@sentry/sveltekit';
import type { User } from './types';

export async function login(email: string, password: string): Promise<{ user: User; token: string } | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      trackLoginFailed();
      throw new Error('Login failed');
    }

    const data = await response.json();
    trackLogin();
    Sentry.addBreadcrumb({ category: 'auth', message: 'User logged in', level: 'info' });
    return data;
  } catch (error) {
    console.error('Error logging in:', error);
    trackLoginFailed();
    return null;
  }
}

export async function logout(): Promise<boolean> {
  try {
    trackLogout();
    Sentry.addBreadcrumb({ category: 'auth', message: 'User logged out', level: 'info' });
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    return response.ok;
  } catch (error) {
    console.error('Error logging out:', error);
    return false;
  }
}

export async function getCurrentUser(customFetch?: typeof fetch): Promise<User | null> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/users/me`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        handleExpiredToken();
      }
      return null;
    }

    const data = await response.json();
    return data.user || null;
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}
