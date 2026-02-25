# Environment Variables

## Backend (cms/.env)
`DATABASE_URI`, `PAYLOAD_SECRET`, `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`, `SUPABASE_URL`, `RESEND_API_KEY`, `REDIS_URL`, `PORT` (default 3001), `SERVER_URL`, `FRONTEND_URL`

## Frontend
`PUBLIC_API_URL` / `VITE_API_URL` / `CMS_URL` pointing to the CMS backend URL, `PUBLIC_SSE_URL` pointing to the SSE service

## SSE Service
`REDIS_URL`, `PORT`/`SSE_PORT`, `SSE_CORS_ORIGIN`

## Bid Worker
`REDIS_URL`, `DATABASE_URL`

## CORS Configuration
CORS is configured in two places:
1. `cms/src/payload.config.ts` — Payload's `cors` and `csrf` arrays
2. `cms/src/server.ts` — Express CORS middleware with dynamic origin checking

Allowed origins: localhost variants, `bidmo.to`, `www.bidmo.to`, `app.bidmo.to`, `*.up.railway.app` (dynamic), `*.vercel.app`, private network IPs (`192.168.x.x`, `10.x.x.x`).

When adding a new deployment domain, add it to BOTH the Payload config and the Express CORS allowedOrigins list.

## Do NOT Commit .env Files
Never push `.env` files to GitHub. Use platform dashboards instead:
- **Railway**: Project > Service > Variables tab (or `railway variables set KEY=VALUE`)
- **Vercel**: Project > Settings > Environment Variables (or `vercel env add KEY`)
- Only commit `.env.example` files with empty values as templates.
