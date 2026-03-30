import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { authStore } from '$lib/stores/auth';

Sentry.init({
    dsn: "https://556b7249278fb084d64b001ea16a7628@o4510938072219648.ingest.us.sentry.io/4510938165346304",
    environment: env.PUBLIC_SENTRY_ENVIRONMENT || 'development',
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.replayIntegration()],
    sendDefaultPii: false
})

// Initialize auth state from user_data (UI state only; token is in httpOnly cookie)
if (typeof window !== 'undefined') {
  // Clean up legacy auth_token from before the refactor
  localStorage.removeItem('auth_token');

  const userStr = localStorage.getItem('user_data');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      authStore.set({
        isAuthenticated: true,
        user,
        token: null,
      });
    } catch (e) {
      localStorage.removeItem('user_data');
    }
  }
}

// Track user identity in Sentry when auth state changes
authStore.subscribe((state) => {
  if (state.isAuthenticated && state.user?.id) {
    Sentry.setUser({ id: state.user.id });
  } else {
    Sentry.setUser(null);
  }
});

export const handleError: HandleClientError = Sentry.handleErrorWithSentry(({ error, event }) => {
  // Auto-reload on stale chunk errors (old tab after a deploy)
  if (
    error instanceof TypeError &&
    error.message?.includes('Failed to fetch dynamically imported module')
  ) {
    const key = 'stale_chunk_reload';
    const last = sessionStorage.getItem(key);
    // Only reload once per 30 seconds to prevent infinite loops
    if (!last || Date.now() - Number(last) > 30_000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
      return;
    }
  }
  console.error('Client error:', error, event);
});
