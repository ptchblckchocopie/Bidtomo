import { sequence } from "@sveltejs/kit/hooks";
import { handleErrorWithSentry, sentryHandle } from "@sentry/sveltekit";
import type { Handle } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";

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

/**
 * Open Graph handler for social media crawlers.
 * Intercepts product page requests from Facebook, Twitter, etc. and returns
 * server-rendered HTML with proper OG meta tags (since SSR is disabled for the SPA).
 */
const CRAWLER_UA = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot/i;

const ogHandler: Handle = async ({ event, resolve }) => {
  const ua = event.request.headers.get('user-agent') || '';
  const { pathname } = event.url;

  // Only intercept product pages for crawlers
  const productMatch = pathname.match(/^\/products\/(\d+)$/);
  if (!productMatch || !CRAWLER_UA.test(ua)) {
    return resolve(event);
  }

  const productId = productMatch[1];
  const cmsUrl = env.CMS_URL || 'http://localhost:3001';

  try {
    const res = await fetch(`${cmsUrl}/api/products/${productId}?depth=1`);
    if (!res.ok) return resolve(event);

    const product = await res.json();
    const title = product.title || 'Product';
    const description = (product.description || 'Check out this auction on BidMo.to').substring(0, 200);
    const url = `https://www.bidmo.to/products/${productId}`;
    const image = product.images?.[0]?.image?.url || '';
    const price = product.currentBid || product.startingPrice || 0;
    const currency = product.currency || 'PHP';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} - BidMo.to</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="BidMo.to" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />` : ''}
  <meta property="product:price:amount" content="${price}" />
  <meta property="product:price:currency" content="${currency}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}
  <link rel="canonical" href="${url}" />
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <p>Current bid: ${currency} ${price}</p>
  <a href="${url}">View on BidMo.to</a>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch {
    return resolve(event);
  }
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Content Security Policy header.
 * Restricts which origins can load scripts, styles, images, and connections.
 */
const cspHandler: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Skip CSP for bridge API routes (JSON responses)
  if (event.url.pathname.startsWith('/api/')) {
    return response;
  }

  const sseUrl = publicEnv.PUBLIC_SSE_URL || '';
  // Extract SSE origin if it's cross-origin
  let sseOrigin = '';
  if (sseUrl) {
    try { sseOrigin = new URL(sseUrl).origin; } catch {}
  }

  const connectSrc = [
    "'self'",
    'https://o4510938072219648.ingest.us.sentry.io',
    sseOrigin,
  ].filter(Boolean).join(' ');

  const csp = [
    "default-src 'self'",
    // Sentry SDK uses eval() for stack traces in dev; unsafe-inline needed for Svelte event handlers
    `script-src 'self' 'unsafe-inline' https://o4510938072219648.ingest.us.sentry.io`,
    // unsafe-inline required for Svelte scoped styles + Google Fonts
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https://veent.sgp1.digitaloceanspaces.com https://sgp1.digitaloceanspaces.com`,
    `media-src 'self' https://veent.sgp1.digitaloceanspaces.com`,
    `connect-src ${connectSrc}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
};

// If you have custom handlers, make sure to place them after `sentryHandle()` in the `sequence` function.
export const handle = sequence(sentryHandle(), ogHandler, csrfProtection, cspHandler);

// If you have a custom error handler, pass it to `handleErrorWithSentry`
export const handleError = handleErrorWithSentry();
