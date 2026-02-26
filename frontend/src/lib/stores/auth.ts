import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'seller' | 'buyer';
  currency?: string;
  countryCode?: string;
  phoneNumber?: string;
  profilePicture?: {
    id: string;
    url: string;
    filename: string;
  } | string | null;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

// Initialize auth state from localStorage if available
function createAuthStore() {
  const initialState: AuthState = {
    isAuthenticated: false,
    user: null,
    token: null,
  };

  // Check localStorage for existing user data
  // Note: JWT token is stored in httpOnly cookie (not accessible to JS)
  // We keep user data in localStorage for UI state only
  if (browser) {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user_data');

    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        // Validate parsed user has required fields before trusting it
        if (user && typeof user.id !== 'undefined' && typeof user.email === 'string') {
          initialState.isAuthenticated = true;
          initialState.user = user;
          initialState.token = token; // May be null if already migrated to httpOnly cookie
        } else {
          // Invalid user data structure, clear it
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_data');
        }
      } catch (e) {
        // Invalid data, clear it
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
      }
    } else if (token) {
      // Token exists but no user data — stale state, clean up
      localStorage.removeItem('auth_token');
    }
  }

  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,
    set: (state: AuthState) => {
      // Persist to localStorage
      if (browser) {
        if (state.isAuthenticated) {
          // Store user data for UI state
          if (state.user) {
            localStorage.setItem('user_data', JSON.stringify(state.user));
          }
          // Store token in localStorage as fallback (for SSE connections that need it)
          // Primary auth uses httpOnly cookie set by the bridge
          if (state.token) {
            localStorage.setItem('auth_token', state.token);
          }
        } else {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user_data');
        }
      }
      set(state);
    },
    update,
    logout: () => {
      if (browser) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        // Also call the bridge to clear the httpOnly cookie
        fetch('/api/bridge/users/logout', { method: 'POST' }).catch(() => {});
      }
      set({
        isAuthenticated: false,
        user: null,
        token: null,
      });
    },
  };
}

export const authStore = createAuthStore();

// Helper function to get auth token (from localStorage, for SSE connections)
export function getAuthToken(): string | null {
  if (browser) {
    return localStorage.getItem('auth_token');
  }
  return null;
}

// Helper function to check if user is authenticated
export function isAuthenticated(): boolean {
  if (browser) {
    return !!localStorage.getItem('user_data');
  }
  return false;
}
