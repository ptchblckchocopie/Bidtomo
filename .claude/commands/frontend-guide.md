# Frontend Guide

## Tech Stack

SvelteKit 2 + Svelte 5, Tailwind CSS 3, adapter-vercel. SSR disabled globally (`export const ssr = false` in `+layout.ts`) — client-side SPA.

## API Bridge Pattern

Browser → `/api/bridge/<resource>` (+server.ts) → `cmsRequest()` → CMS `:3001/api/<resource>`

- `src/lib/server/cms.ts` — Server-only `cmsRequest()`, uses `$env/dynamic/private`. Never import in client code.
- `src/lib/api.ts` — Client-side typed API layer. All calls go to `/api/bridge/*`.
- Token extraction order: `Authorization: JWT` → `Authorization: Bearer` → `auth_token` httpOnly cookie.

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks.server.ts` | CSRF protection (Origin validation on bridge mutating requests) + Sentry |
| `src/hooks.client.ts` | Client-side Sentry + Session Replay on errors |
| `src/lib/api.ts` | Typed API client (~1500 lines, JWT auth) |
| `src/lib/sse.ts` | SSE clients: Product, User, Global (with polling fallback) |
| `src/lib/server/cms.ts` | Bridge proxy helper |
| `src/lib/stores/auth.ts` | Auth store (Svelte 4 `writable`, not yet migrated to runes) |
| `src/lib/stores/inbox.ts` | Unread message count |
| `src/lib/stores/theme.ts` | Theme (`light`/`dark`/`system`, persisted to localStorage) |
| `src/lib/stores/watchlist.ts` | Watchlist with `Map<productId, watchlistItemId>` for O(1) lookup |
| `src/lib/stores/locale.ts` | i18n store with `t` derived store |
| `src/lib/analytics.ts` | Client-side analytics batching (3s flush, sendBeacon on unload) |
| `src/lib/data/categories.ts` | 19 product categories, `CategoryValue` type |
| `src/lib/i18n/` | Translation JSON files (en, fil, ja, zh, vi) |

## Auth & Stores

- Dual token: httpOnly `auth_token` cookie (bridge routes) + localStorage token (SSE connections)
- Token format: `Authorization: JWT {token}` (also accepts `Bearer`)
- User roles: `admin`, `seller`, `buyer` (default)
- Protected routes use `+page.ts` load guards with `redirect()`, not client-side `onMount` checks

## Admin Features

- Only `admin` role can access CMS admin panel
- Non-admin CMS login shows custom Unauthorized page (webpack alias override)
- Admin sees **Hide/Unhide** button on products + **Hidden Items** tab (`?status=hidden`)

## i18n System (`src/lib/i18n/`)

Custom store-based i18n (no external library). English bundled at startup; Filipino, Japanese, Chinese, Vietnamese lazy-loaded via dynamic import.

```svelte
<script>
  import { t } from '$lib/stores/locale';
</script>
<p>{$t('nav.browse')}</p>
<p>{$t('greeting', { name: 'Alice' })}</p>
```

- Locale persisted to `localStorage` key `locale`, updates `<html lang>`
- Fallback chain: current locale → English → raw key
- Category labels: `$t('categories.' + category.value)` (not `getCategoryLabel()`)
- Frontend-only — CMS admin and product content not translated

**Translated:** layout (nav + footer), login, register, browse page.
**Not yet:** product detail, sell, dashboard, inbox, profile, watchlist, about-us, admin pages.

## Real-Time (SSE)

- `src/lib/sse.ts` — ProductSSEClient, UserSSEClient, GlobalSSEClient
- Exponential backoff reconnection with fallback polling
- Redis channels: `sse:product:{id}`, `sse:user:{id}`, `sse:global`
- SSE endpoints: `/events/products/:id`, `/events/users/:id` (auth via `?token=`), `/events/global`

## Search

- Bridge: `GET /api/bridge/products/search?q=...&status=...&region=...&city=...`
- Proxies to CMS `GET /api/search/products` (Elasticsearch with Payload fallback)
- Admin sync: `POST /api/bridge/elasticsearch/sync`

## Design System (Bauhaus)

- Sharp corners: `* { border-radius: 0 !important }` in `app.css` (only `.rounded-full` exempted)
- Bold borders, Outfit font
- Tailwind `bh-*` tokens: `bh-red`, `bh-blue`, `bh-yellow`, `bh-bg`, `bh-fg`
- Shadows: `shadow-bh-sm`, `shadow-bh-md`
- Borders: `border-bh`, `border-bh-lg`
- Utility classes: `.btn-bh`, `.btn-bh-red`, `.btn-bh-blue`, `.card-bh`, `.input-bh`, `.headline-bh`
- For deep frontend craft (motion, dark theme, Three.js, accessibility), invoke `/frontend-god`

## Error Tracking

`@sentry/sveltekit` with `sentrySvelteKit()` vite plugin. Source maps + Session Replay on errors. User ID attached via `authStore.subscribe()`.
