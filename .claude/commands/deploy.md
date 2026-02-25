# Deployment Guide

## Production Infrastructure
- **Frontend** — Deployed on **Vercel** (auto-deploys from `main` branch via GitHub integration)
- **CMS** — Deployed on **Railway** (project: `accomplished-perception`, service: `cms`). Deploy manually via `npx @railway/cli up` from `cms/` directory. NOT auto-deploy — requires `railway up` each time.
- **SSE Service** — Railway service `sse-service`
- **Bid Worker** — Railway service `bid-worker`
- **Database** — Railway PostgreSQL service
- **Redis** — Railway Redis service
- **Storage** — Supabase Storage (S3-compatible), bucket: `bidmo-media`, prefix: `bidmoto/`

## Deploying CMS to Railway
```bash
cd cms
npx @railway/cli up --detach    # Upload and deploy
npx @railway/cli deployment list --json --limit 1  # Check status
npx @railway/cli logs --lines 50  # View deploy logs
npx @railway/cli logs --build --lines 50  # View build logs
```

## Railway Project IDs
- Project: `d5441340-2ee1-4ecf-be7f-62325c9ea414` (accomplished-perception)
- CMS service: `3aee625c-eb29-4833-9e1f-7513cf5a718a`
- Bid worker service: `d6c2ca56-140b-4ad8-9284-ae96c8323293`
- SSE service: `f9a804a8-cfd6-4405-8e7e-6ac978458372`
- Environment: `production` (`a2ef8422-b3b9-4c28-9fb5-649aa4799877`)

## Vercel Project
- Team: `team_xP9PApyY2co0Lt9dlBg4XaPp` (ptchblckchocopie's projects)
- Project: `prj_xtn99uGJzihF1jyk5WKQloVoKg0E` (bidtomo)
- Auto-deploys from GitHub `main` branch

## Important: CMS Admin Webpack Build
Do NOT add `admin.css` to the Payload config. The `css` property in `admin: { css: ... }` triggers a Sass `@import '~payload-user-css'` during `payload build` that fails in the Nixpacks build environment. If you need to customize admin styles, use Payload's `components` API or webpack aliases instead.

## Important: CMS `serverURL`
The `serverURL` in `payload.config.ts` is set to `process.env.SERVER_URL || ''` (empty string). Do NOT hardcode a domain — empty string makes Payload use relative URLs, which works from any domain (Railway, custom domain, localhost).
