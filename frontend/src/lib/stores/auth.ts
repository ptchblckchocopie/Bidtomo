import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'seller' | 'buyer';
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

  // Check localStorage for existing token
  if (browser) {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user_data');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        initialState.isAuthenticated = true;
        initialState.user = user;
        initialState.token = token;
      } catch (e) {
        // Invalid data, clear it
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
      }
    }
  }

  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,
    set: (state: AuthState) => {
      // Persist to localStorage
      if (browser) {
        if (state.isAuthenticated && state.token) {
          localStorage.setItem('auth_token', state.token);
          if (state.user) {
            localStorage.setItem('user_data', JSON.stringify(state.user));
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

// Helper function to get auth token
export function getAuthToken(): string | null {
  if (browser) {
    return localStorage.getItem('auth_token');
  }
  return null;
}

// Helper function to check if user is authenticated
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}
