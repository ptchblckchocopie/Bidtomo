# User Analytics Tracking — Implementation Spec

**Status:** Planned, not yet implemented.

## Goal
Track all user actions in a new `user-events` Payload collection. Admin-only access via Payload admin panel.

## Architecture
```
Frontend (browser)                    CMS (server)
─────────────────                    ────────────────
analytics.ts                         POST /api/analytics/track
  ↓ batch events every 3s               ↓
  ↓ sendBeacon on page close         (global as any).trackEvent()
/api/bridge/analytics/track ──→        ↓ fire-and-forget (setImmediate)
                                     payload.create('user-events')
                                         ↑
                                     afterChange hooks on existing
                                     collections (bids, products,
                                     messages, transactions, ratings)
                                     + void-request endpoints
```

## Events to Track
- **Frontend-sourced:** `page_view`, `login`, `login_failed`, `logout`, `register`, `search` (with query/filters/resultCount), `product_view`, `conversation_opened`, `user_profile_viewed`, `media_uploaded`
- **CMS hook-sourced:** `bid_placed`, `product_created`, `product_updated`, `product_sold`, `message_sent`, `transaction_status_changed`, `rating_created`, `rating_follow_up`
- **CMS endpoint-sourced:** `bid_accepted`, `void_request_created`, `void_request_responded`, `seller_choice_made`, `second_bidder_responded`, `profile_updated`, `profile_picture_changed`

## `user-events` Collection Schema
- `eventType` — select field (indexed), all event types above
- `user` — optional relationship to users (null for anonymous page views), indexed
- `page` — text, URL pathname
- `metadata` — JSON, event-specific data (productId, amount, query, etc.)
- `sessionId` — text (indexed), `crypto.randomUUID()` per browser tab via `sessionStorage`
- `deviceInfo` — JSON (userAgent, screenWidth/Height, viewportWidth/Height, platform, language, touchSupport)
- `referrer` — text, `document.referrer`
- `ip` — text, extracted server-side from `x-forwarded-for`
- Access: admin-only read/create/update/delete. Admin panel group: "Analytics"

## Files to Create
1. **`frontend/src/lib/analytics.ts`** — Core module. Session ID via `sessionStorage` + `crypto.randomUUID()`. Device info cached. Event queue with 3s flush interval, max batch 10. `sendBeacon` on `visibilitychange` for page-unload delivery. Convenience functions: `trackPageView`, `trackSearch`, `trackProductView`, `trackLogin`, `trackLogout`, `trackLoginFailed`, `trackRegister`, `trackConversationOpened`, `trackUserProfileViewed`, `trackMediaUploaded`. All failures silently swallowed.
2. **`frontend/src/routes/api/bridge/analytics/track/+server.ts`** — Bridge route. Token optional (anonymous allowed). Always returns `{ success: true }`. Follow typing bridge pattern (`cmsRequest`, `getTokenFromRequest`, `jsonResponse`).

## Files to Modify

**CMS:**
1. **`cms/src/payload.config.ts`**
   - Add `user-events` collection before `EmailTemplates` (line 1496)
   - Products `afterChange` (line 321): add `trackEvent` for `product_created`, `product_updated`, `product_sold`
   - Bids `afterChange` (line 741): add `trackEvent` for `bid_placed`
   - Messages `afterChange` (line 880): add `trackEvent` for `message_sent`
   - Transactions: add new `afterChange` hook after line 1023 for `transaction_status_changed`
   - Ratings: add new `afterChange` hook after line 1300 for `rating_created`, `rating_follow_up`

2. **`cms/src/server.ts`**
   - Add `(global as any).trackEvent` near line 774 (alongside other globals). Uses `setImmediate` + `payload.create` with `overrideAccess: true`. Catches all errors silently.
   - Add `POST /api/analytics/track` endpoint before `payload.init()`. Rate limit: 120/min. Optional JWT auth (extract userId if present, allow anonymous). Always returns 200. Extracts IP from `x-forwarded-for`.
   - Add `trackEvent` calls inside void-request endpoints (lines 1314, 1437, 1572, 1754) and bid accept endpoint

3. **`cms/src/middleware/validate.ts`** — Add `analyticsTrackSchema`: `z.object({ eventType: z.string().min(1), page: z.string().optional(), metadata: z.record(z.any()).optional(), sessionId: z.string().optional(), deviceInfo: z.record(z.any()).optional(), referrer: z.string().optional() })`

**Frontend:**
4. **`frontend/src/routes/+layout.svelte`** — Import `afterNavigate` from `$app/navigation` + `trackPageView` from `$lib/analytics`. Add `afterNavigate` callback to track page views.
5. **`frontend/src/lib/api.ts`** — Import tracking functions. Add `trackLogin()`/`trackLoginFailed()` in `login()`, `trackLogout()` in `logout()`, `trackSearch()` in `fetchProducts()` when search query present.
6. **`frontend/src/routes/products/[id]/+page.svelte`** — Add `trackProductView(productId, title)` on mount/when product loads.
7. **`frontend/src/routes/users/[id]/+page.svelte`** — Add `trackUserProfileViewed(userId)` on mount.
8. **`frontend/src/routes/inbox/+page.svelte`** — Add `trackConversationOpened(productId)` when selecting a conversation.

## Key Patterns to Follow
- **Global function injection**: Same pattern as `publishProductUpdate` — assign to `(global as any)` in server.ts to avoid Webpack admin bundle crash
- **Fire-and-forget**: `setImmediate()` in hooks, same as products afterChange line 326
- **Bridge route**: Follow `frontend/src/routes/api/bridge/typing/+server.ts` pattern exactly
- **Relationship ID extraction**: `typeof doc.bidder === 'object' ? doc.bidder?.id : doc.bidder` (used throughout existing hooks)

## Post-Implementation
- Run `npm run generate:types` in `cms/`
- Run `tsc --noEmit` in `cms/` and `npm run check` in `frontend/`
- Verify events appear in Payload admin panel under "Analytics" group
