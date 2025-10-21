import type { HandleClientError } from '@sveltejs/kit';
import { authStore } from '$lib/stores/auth';

// Initialize auth state when the app loads
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('auth_token');
  const userStr = localStorage.getItem('user_data');

  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      authStore.set({
        isAuthenticated: true,
        user,
        token,
      });
    } catch (e) {
      // Invalid data, clear it
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
    }
  }
}

export const handleError: HandleClientError = ({ error, event }) => {
  console.error('Client error:', error, event);
};
