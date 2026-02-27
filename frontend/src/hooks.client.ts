import * as Sentry from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';
import { authStore } from '$lib/stores/auth';

// If you don't want to use Session Replay, remove the `Replay` integration,
// `replaysSessionSampleRate` and `replaysOnErrorSampleRate` options.
Sentry.init({
    dsn: "https://556b7249278fb084d64b001ea16a7628@o4510938072219648.ingest.us.sentry.io/4510938165346304",
    tracesSampleRate: 1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.replayIntegration()],
    enableLogs: true,
    sendDefaultPii: false
})

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

export const handleError: HandleClientError = Sentry.handleErrorWithSentry(({ error, event }) => {
  console.error('Client error:', error, event);
});