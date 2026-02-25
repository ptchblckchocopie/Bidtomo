# Frontend Guide

## Tech Stack
SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel (both adapter-vercel and adapter-node installed).

## API Bridge Pattern
The frontend never calls the CMS directly from the browser. All requests go through SvelteKit server routes at `frontend/src/routes/api/bridge/[...path]/` which proxy to the CMS backend. This keeps the CMS URL private and handles auth header forwarding.

**Request flow:** Browser → SvelteKit server route (`/api/bridge/*`) → Payload CMS (`localhost:3001/api/*`)

## API Client
`frontend/src/lib/api.ts` contains typed functions for all API operations. It reads the auth token from `localStorage.auth_token` and attaches `Authorization: JWT {token}` headers.

## Auth & Stores
- `frontend/src/lib/stores/auth.ts` — Svelte store managing JWT token + user data (persisted in localStorage)
- `frontend/src/lib/stores/inbox.ts` — Unread message count store
- Token format in headers: `Authorization: JWT {token}` (also accepts `Bearer`)
- User roles: `admin`, `seller`, `buyer` (default)

## Admin Features
- Only `admin` role users can access the Payload CMS admin panel (`access.admin` in users collection)
- Non-admin users who try to log into the CMS see a custom Unauthorized page (frog video + auto-redirect to login). Implemented via webpack alias in `payload.config.ts` replacing Payload's `Unauthorized` view with `cms/src/components/UnauthorizedView.tsx`
- Express middleware in `cms/src/server.ts` also redirects non-admin users to `/admin/access-denied`
- Admin users see a **Hide/Unhide** button on product cards and detail pages
- **Hidden Items** tab (admin-only) in the products browse page at `?status=hidden`
- Products use the existing `active` field (boolean) to control visibility

## Real-Time (SSE)
- `frontend/src/lib/sse.ts` — SSE client: connections, reconnection logic, event dispatching
- **Redis channels:** `sse:product:{id}` (bids), `sse:user:{id}` (messages), `sse:global` (new listings)
- **SSE endpoints:** `/events/products/:productId`, `/events/users/:userId`, `/events/global`

## Rendering & Design
- SSR is disabled globally (`export const ssr = false` in `+layout.ts`) — client-side SPA.
- **Bauhaus design system**: sharp corners (`* { border-radius: 0 !important }` in `app.css`, only `.rounded-full` exempted), bold borders, Outfit font.
- Tailwind `bh-*` tokens: colors (`bh-red`, `bh-blue`, `bh-yellow`, `bh-bg`, `bh-fg`), shadows (`shadow-bh-sm`, `shadow-bh-md`), borders (`border-bh`, `border-bh-lg`).
- Utility classes: `.btn-bh`, `.btn-bh-red`, `.btn-bh-blue`, `.card-bh`, `.input-bh`, `.headline-bh`.

## Error Tracking
Frontend uses `@sentry/sveltekit`. SvelteKit config enables experimental `tracing` and `instrumentation` for server-side tracing.
