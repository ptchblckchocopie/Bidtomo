# Security Model

## Access Control

Uses Payload `Where` queries (not afterRead hooks) for messages, transactions, void-requests, and products. This filters at the DB level. Internal `payload.find/findByID` calls use `overrideAccess: true` (Payload local API default), so server-side logic is unaffected.

## Rate Limiting

CMS uses `express-rate-limit`:
- Login: 10 attempts / 15 min
- Registration: 5 / hr
- Bid queue/accept: 30 / min
- Void requests: 5 / user / 24hr (application logic)

## CSRF

`hooks.server.ts` validates Origin header on all state-changing bridge requests. Combined with `SameSite=Strict` cookie.

## SSE Auth

`/events/users/:userId` requires `?token=<jwt>` query param verified against `PAYLOAD_SECRET`. Product and global endpoints are unauthenticated (public data).

## Email Templates

All user-controlled values must be escaped with `escHtml()` (defined in `emailService.ts`). The `renderTemplate()` function auto-escapes `{{variable}}` substitutions.

## Users PII

`afterRead` hook strips email, phone, countryCode from REST API responses. Only admins and the user themselves see full data. The hook checks `req.res` to skip for local API calls.

## Products Visibility

`read` access returns a `Where` query — non-admins only see `active: true` products (plus their own). Frontend load guards in `+page.ts` files provide defense-in-depth.

## Protected Routes

Use `+page.ts` load guards with `redirect()`, not client-side `onMount` checks. See `frontend/src/routes/sell/+page.ts`, `profile/+page.ts`, `inbox/+page.ts`.
