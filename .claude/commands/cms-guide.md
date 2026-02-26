# CMS (Payload CMS) Guide

## Structure
- Collections defined inline in `cms/src/payload.config.ts` (~1,000 lines): `users`, `products`, `bids`, `messages`, `transactions`, `void-requests`, `ratings`, `media`. `EmailTemplates` is in `cms/src/collections/EmailTemplates.ts`.
- `cms/src/server.ts` (~1,750 lines) — All custom Express endpoints (20+). Main business logic file.
- `cms/src/redis.ts` — Redis client, queue helpers (`queueBid`, `queueAcceptBid`), pub/sub publishers.
- `cms/src/auth-helpers.ts` — `authenticateJWT()` helper for custom endpoints.
- `cms/src/services/emailService.ts` — Resend-based transactional email service.
- Payload hooks (`beforeChange`, `afterChange`) are inline in collections and use `(global as any).publishProductUpdate` etc. for Redis pub/sub to avoid Webpack bundling issues.

## Custom Admin React Components
TSX files in `cms/src/components/` are used only by Payload's webpack admin bundle (browser-side), NOT by the server-side `tsc` build. They are excluded from `tsconfig.json` via `"exclude": ["src/components/**/*.tsx"]`. To override a built-in Payload view, add a webpack alias in `payload.config.ts` (see `UnauthorizedView.tsx` as an example).

## Column Naming Convention
Payload CMS v2 postgres adapter uses `to-snake-case` for most column names, BUT **select/enum field columns keep the raw camelCase fieldName** as the column name. For example:
- `bidInterval` → column `bid_interval` (regular field, snake_case)
- `raterRole` (select field) → column `"raterRole"` (camelCase, quoted)
- Enum TYPE names are always snake_case: `enum_ratings_rater_role`

This was discovered by reading `@payloadcms/db-postgres/schema/traverseFields.js`. Keep this in mind when writing raw SQL or creating migration files.

## Startup Database Migrations
The CMS `server.ts` runs auto-migrations on startup (after `payload.init`) using a direct `pg` Pool connection:
- Creates `users_rels` table (needed for `profilePicture` upload field)
- Adds `void_requests_id` column to `transactions_rels` (needed for `voidRequest` relationship)
- Uses `IF NOT EXISTS` / `EXCEPTION WHEN duplicate_*` so it's safe to run repeatedly.

## Storage
Image uploads go to **Supabase Storage** (S3-compatible) via `@payloadcms/plugin-cloud-storage`.
- Supabase URL: `https://htcdkqplcmdbyjlvzono.supabase.co`
- Bucket: `bidmo-media`
- Prefix: `bidmoto/`
- Public URL pattern: `https://htcdkqplcmdbyjlvzono.supabase.co/storage/v1/object/public/bidmo-media/bidmoto/{filename}`

## Elasticsearch Integration
- `cms/src/services/elasticSearch.ts` — Client, indexing, search, bulk sync functions.
- **Index name:** `products` — mappings for title, description, keywords, status, region, city, etc.
- **Search endpoint:** `GET /api/search/products?q=...&status=...&region=...&city=...&page=...&limit=...` (in `server.ts`). **NOT** `/api/products/search` — that path conflicts with Payload's built-in `GET /api/products/:id` route.
- **Sync endpoint:** `POST /api/elasticsearch/sync` (admin-only) — bulk indexes all products from Payload into ES.
- **Auto-indexing:** Payload `afterChange` hooks on the `products` collection call `indexProduct()` / `updateProductIndex()` / `removeProductFromIndex()` via `(global as any)` pattern.
- **ES v9 client compatibility:** The `@elastic/elasticsearch` v9 client sends `compatible-with=9` vendored headers that v7/v8 servers reject. The client in `elasticSearch.ts` overrides these with plain `application/json` headers.
- **Fallback:** If ES is unavailable, search falls back to Payload's built-in `find()` with regex-based text matching (slower but functional).
- **Env var:** `ELASTICSEARCH_URL` — on Railway, uses reference syntax `http://${{Elasticsearch.RAILWAY_PRIVATE_DOMAIN}}:9200` for proper service linking.

## Profile Picture Feature
- `profilePicture` field on users collection (`type: 'upload', relationTo: 'media'`).
- CMS endpoints: `POST /api/users/profile-picture` (set new, delete old) and `DELETE /api/users/profile-picture` (remove).
- Bridge: `POST/DELETE /api/bridge/users/profile-picture`.
- Old profile pictures are automatically deleted from Supabase when replaced.
