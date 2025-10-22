# PayloadCMS Vercel Deployment Guide

## Quick Setup

### 1. Set Environment Variables in Vercel

Go to your Vercel project → Settings → Environment Variables and add:

```
DATABASE_URI=your-digital-ocean-postgres-connection-string
PAYLOAD_SECRET=your-long-random-secret-here
SERVER_URL=https://your-cms.vercel.app
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
VERCEL=1
```

**Important for Digital Ocean PostgreSQL:**
Your `DATABASE_URI` should look like:
```
postgresql://username:password@host:port/database?sslmode=require
```

### 2. Build Configuration

Vercel will automatically detect and use the `vercel-build` script from package.json:
```
npm run vercel-build
```

This runs: `tsc && payload build`

**Important Settings in Vercel:**
- **Root Directory**: Set to `cms`
- **Build Command**: Leave as default (Vercel auto-detects `vercel-build`)
- **Output Directory**: Leave empty (uses `dist` automatically)
- **Install Command**: `npm install`

Make sure the `src/` directory is **NOT** excluded from deployment (check `.vercelignore`).

### 3. Deploy

Push your code to Git and Vercel will automatically deploy, or use:
```bash
vercel --prod
```

## Troubleshooting

### 500 Error: FUNCTION_INVOCATION_FAILED

This usually means:
1. **Missing environment variables** - Check that all required env vars are set in Vercel
2. **Database connection failed** - Verify DATABASE_URI is correct and includes `?sslmode=require`
3. **Cold start timeout** - PayloadCMS initialization takes time; first request after idle might timeout

### 404 Error: NOT_FOUND

This means:
1. **Build failed** - Check Vercel build logs
2. **Wrong root directory** - Make sure Root Directory is set to `cms` in Vercel project settings
3. **Missing dist folder** - Ensure `npm run build` completes successfully

### Checking Logs

View real-time logs in Vercel:
1. Go to your deployment
2. Click "Functions" tab
3. Click on the function to see logs

## ⚠️ Known Limitations

**PayloadCMS is NOT ideal for Vercel serverless** because:

1. **Cold Starts**: 3-10 second delays when function wakes up
2. **Timeout Limits**: 10 seconds default (30 max on Pro plan)
3. **File Uploads**: Media uploads stored in `/tmp` will be lost between invocations
4. **SSE Not Working**: Server-Sent Events won't work properly due to timeout limits
5. **No WebSockets**: Real-time features are limited

## Recommended Alternatives

For better performance, consider deploying CMS to:
- **Render.com** (free tier available)
- **Railway.app** (free tier available)
- **Fly.io** (free tier available)
- **Digital Ocean App Platform** ($5/month)

Then deploy only the frontend to Vercel.

## Media Upload Solution for Vercel

If you must use Vercel, configure S3/Cloudinary for media uploads instead of local storage:

```typescript
import { S3StoragePlugin } from '@payloadcms/plugin-cloud-storage'

export default buildConfig({
  plugins: [
    S3StoragePlugin({
      collections: {
        media: true,
      },
      bucket: process.env.S3_BUCKET,
      config: {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        },
        region: process.env.S3_REGION,
      },
    }),
  ],
})
```

## Files Modified for Vercel

- `/api/index.js` - Serverless function handler
- `/vercel.json` - Vercel configuration
- `/src/server.ts` - Modified to support serverless export
- `/src/payload.config.ts` - Updated CORS and database config
- `/.vercelignore` - Files to exclude from deployment
