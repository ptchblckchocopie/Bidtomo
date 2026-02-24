# Vercel Deployment Guide for PayloadCMS

## ⚠️ IMPORTANT: Known Issues

**PayloadCMS with Express is NOT ideal for Vercel serverless functions** because:

1. **Cold Start Penalty**: Payload must initialize on every cold start = 3-10 second delays
2. **10-Second Timeout**: Default serverless timeout on Vercel is 10 seconds (30 sec max on Pro)
3. **No Persistent Features**: SSE (Server-Sent Events) won't work properly due to timeouts
4. **Memory Constraints**: Limited memory for serverless functions

### ✅ Better Alternatives (Recommended)

Deploy your CMS backend to platforms designed for long-running Node.js servers:

1. **[Render](https://render.com)** - Free tier available, automatic deployments
2. **[Railway](https://railway.app)** - Free tier, great DX
3. **[Fly.io](https://fly.io)** - Free tier, global edge deployment
4. **[Digital Ocean App Platform](https://www.digitalocean.com/products/app-platform)** - $5/month

Then deploy **just your SvelteKit frontend** to Vercel.

---

## If You Still Want to Try Vercel...

### Prerequisites

1. Digital Ocean PostgreSQL database (already set up)
2. Vercel account
3. GitHub repository

### Environment Variables

Set these in your Vercel project settings:

```bash
DATABASE_URI=postgresql://username:password@host:port/database?sslmode=require
PAYLOAD_SECRET=your-long-random-secret-key
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
```

### Steps

1. **Build the project**:

   ```bash
   cd cms
   npm run build
   ```

2. **Deploy to Vercel** (from cms directory):

   ```bash
   vercel
   ```

3. **Set Environment Variables**:
   - Go to your Vercel project dashboard
   - Settings → Environment Variables
   - Add all variables from `.env.example`

4. **Configure Build Settings** in Vercel:
   - **Framework Preset**: Other
   - **Root Directory**: `cms`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. **Redeploy** after setting environment variables

### Troubleshooting

#### Error: FUNCTION_INVOCATION_FAILED

**Cause**: Cold start timeout or initialization error

**Solutions**:

- Check Vercel logs (click on the deployment → "Functions" tab → View logs)
- Verify DATABASE_URI includes `?sslmode=require` for Digital Ocean
- Verify PAYLOAD_SECRET is set
- Check database is accessible from Vercel's IP ranges

#### Error: Database connection failed

**Fix**: Ensure your Digital Ocean database:

1. Has SSL enabled
2. Connection string includes `?sslmode=require`
3. Is not restricted to specific IPs (or whitelist Vercel IPs)

#### Slow Response Times

**Expected**: First request after cold start will be VERY slow (10-30 seconds)

- Subsequent requests will be faster (if within ~5 minutes)
- This is why Vercel is **not recommended** for this use case

### Checking Logs

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# View logs
vercel logs [deployment-url]
```

### Migration to Better Platform

When ready to move to a proper server platform:

1. Choose platform (Render recommended for free tier)
2. Connect GitHub repository
3. Set environment variables
4. Deploy
5. Update `VITE_API_URL` in frontend to new CMS URL

---

## Recommended Setup

**Backend (CMS)**: Deploy to Render/Railway
**Frontend**: Deploy to Vercel
**Database**: Digital Ocean PostgreSQL

This gives you:

- ✅ Fast, reliable backend
- ✅ No cold starts
- ✅ SSE/WebSocket support
- ✅ Better performance
- ✅ Often still free or very cheap
