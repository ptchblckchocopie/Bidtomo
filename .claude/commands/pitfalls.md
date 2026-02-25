# Known Pitfalls

These are recurring issues discovered during development. Check these when debugging:

- **`typeof x === 'object'` is true for `null`** — Always guard with `x && typeof x === 'object'` when checking Payload relationship fields (e.g., `originalDoc?.seller`).
- **Payload select/enum column naming** — Raw SQL for select fields must use quoted camelCase (`"raterRole"`), not snake_case. Regular fields use snake_case. Enum TYPE names are always snake_case: `enum_ratings_rater_role`. See cms-guide for details.
- **SvelteKit `$env/static/public` fails if var is missing** — Use `$env/dynamic/public` for optional env vars (e.g., `PUBLIC_SSE_URL`).
- **SSE Redis reconnect duplicates** — Must call `punsubscribe` + `removeAllListeners('pmessage')` before re-subscribing on Redis reconnect, or handlers stack up.
- **CMS custom endpoints lack auth** — Custom Express routes in `cms/src/server.ts` don't get Payload's auth middleware automatically. Each endpoint copy-pastes a ~15-line JWT extraction block. When adding new endpoints, copy this pattern from `cms/src/auth-helpers.ts`.
- **Redis port must be 6379** — All services (CMS, SSE, bid-worker) must use the same Redis instance. The CMS default was previously wrong (6380).
- **Bid-worker fallback paths** — When Redis is down, the CMS `/api/bid/accept` fallback in `cms/src/server.ts` must replicate everything the bid-worker does (message creation, transaction record, SSE publish).
- **`product.seller` can be null** — Always use optional chaining (`product.seller?.id`) in frontend templates. Seller is a relationship field that may not be populated.
- **No test suite exists** — Zero test files in the entire project. Validate changes manually or by reading code carefully.
- **Svelte 5 runes mode reactivity** — Any `.svelte` file using `$props()`, `$state()`, or `$derived()` is in runes mode. In runes mode, plain `let` variables are **NOT reactive**. All interactive state must use `$state()` to trigger UI updates. This has caused buttons/tabs to appear non-functional.
- **Adding relationship fields requires DB migration** — Adding an `upload` or `relationship` field to a Payload collection creates a `{collection}_rels` junction table. If the table doesn't exist, ALL queries on that collection fail with `relation "X_rels" does not exist`. The CMS startup migration in `server.ts` handles known cases (`users_rels`, `transactions_rels.void_requests_id`).
- **Expired JWT tokens cause 403 loops** — Frontend has `handleExpiredToken()` in `api.ts` that auto-logouts and redirects to `/login` on 401/403 responses.
- **Mobile edge-to-edge pattern** — The layout `<main>` has `px-4` padding. Page components must use `margin-left: -1rem; margin-right: -1rem; padding-left: 1rem; padding-right: 1rem;` in mobile media queries to go edge-to-edge and prevent Bauhaus box-shadows from causing visual right-shift.
