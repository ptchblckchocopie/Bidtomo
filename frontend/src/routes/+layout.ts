import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';

export const load: LayoutLoad = async () => {
  // Check for auth on client-side only
  if (browser) {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user_data');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        return {
          user,
          isAuthenticated: true,
        };
      } catch (e) {
        return {
          user: null,
          isAuthenticated: false,
        };
      }
    }
  }

  return {
    user: null,
    isAuthenticated: false,
  };
};

// Enable client-side routing
export const ssr = false;
