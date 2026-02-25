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

## Profile Picture Feature
- `profilePicture` field on users collection (`type: 'upload', relationTo: 'media'`).
- CMS endpoints: `POST /api/users/profile-picture` (set new, delete old) and `DELETE /api/users/profile-picture` (remove).
- Bridge: `POST/DELETE /api/bridge/users/profile-picture`.
- Old profile pictures are automatically deleted from Supabase when replaced.
