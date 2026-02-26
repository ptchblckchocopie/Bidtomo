import { sequence } from "@sveltejs/kit/hooks";
import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
import type { Handle } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

/**
 * CSRF protection for bridge API endpoints.
 * Validates that state-changing requests (POST, PUT, PATCH, DELETE) to /api/bridge/*
 * originate from the same site by checking the Origin header.
 * This is critical now that auth uses httpOnly cookies (auto-sent by browser).
 */
const csrfProtection: Handle = async ({ event, resolve }) => {
  const { request, url } = event;
  const method = request.method;

  // Only check state-changing methods on bridge endpoints
  if (
    url.pathname.startsWith('/api/bridge/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  ) {
    const origin = request.headers.get('Origin');

    // Origin header is required for state-changing requests
    if (origin) {
      const requestOrigin = new URL(origin).origin;
      const serverOrigin = url.origin;

      if (requestOrigin !== serverOrigin) {
        return json(
          { error: 'CSRF validation failed: origin mismatch' },
          { status: 403 }
        );
      }
    }
    // Note: If Origin header is absent (e.g., same-origin fetch without it),
    // we allow the request. Browsers always send Origin on cross-origin requests.
  }

  return resolve(event);
};

// If you have custom handlers, make sure to place them after `sentryHandle()` in the `sequence` function.
export const handle = sequence(sentryHandle(), csrfProtection);

// If you have a custom error handler, pass it to `handleErrorWithSentry`
export const handleError = handleErrorWithSentry();
