import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { disconnectAll } from '$lib/sse';

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

  // Check localStorage for existing user data (UI state only)
  // JWT token is stored in httpOnly cookie — never in localStorage
  if (browser) {
    // Clean up legacy auth_token if it exists from before the refactor
    localStorage.removeItem('auth_token');

    const userStr = localStorage.getItem('user_data');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user && typeof user.id !== 'undefined' && typeof user.email === 'string') {
          initialState.isAuthenticated = true;
          initialState.user = user;
        } else {
          localStorage.removeItem('user_data');
        }
      } catch (e) {
        localStorage.removeItem('user_data');
      }
    }
  }

  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,
    set: (state: AuthState) => {
      // Persist user data to localStorage for UI state only
      // Token lives in httpOnly cookie — never stored client-side
      if (browser) {
        if (state.isAuthenticated && state.user) {
          localStorage.setItem('user_data', JSON.stringify(state.user));
        } else {
          localStorage.removeItem('user_data');
        }
      }
      set(state);
    },
    update,
    logout: () => {
      if (browser) {
        disconnectAll();
        localStorage.removeItem('user_data');
        // Call bridge to clear the httpOnly cookie
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

// Helper function to check if user is authenticated (from UI state)
export function isAuthenticated(): boolean {
  if (browser) {
    return !!localStorage.getItem('user_data');
  }
  return false;
}
