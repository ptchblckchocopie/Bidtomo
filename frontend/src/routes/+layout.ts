import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';

export const load: LayoutLoad = async () => {
  // Check for auth on client-side only (user_data for UI state; token in httpOnly cookie)
  if (browser) {
    const userStr = localStorage.getItem('user_data');
    if (userStr) {
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
