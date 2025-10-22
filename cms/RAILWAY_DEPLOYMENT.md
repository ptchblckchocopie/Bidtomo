# Deploy PayloadCMS to Railway (Recommended)

Railway is **FREE** for hobby projects and handles PayloadCMS perfectly (unlike Vercel).

## Why Railway Instead of Vercel?

✅ **Perfect for PayloadCMS:**
- No cold starts
- No build timeouts
- Persistent file system (media uploads work)
- WebSockets & SSE work properly
- $5 free credit monthly (enough for small projects)

❌ **Vercel Problems:**
- Build hangs/times out on `payload build`
- Cold starts (3-10 sec delays)
- No persistent storage (media uploads lost)
- 30 second timeout limit

## Step-by-Step Railway Deployment

### 1. Sign Up for Railway
1. Go to https://railway.app
2. Sign up with GitHub
3. Get $5 free credits monthly (no credit card required)

### 2. Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository: `VeentEG/bidmo.to`
4. Railway will detect your project

### 3. Configure the Service

Click on the deployed service, then:

**Root Directory:**
```
cms
```

**Build Command:**
```
npm run vercel-build
```

**Start Command:**
```
npm run serve
```

### 4. Set Environment Variables

In Railway dashboard → Variables tab, add:

```
DATABASE_URI=your-digital-ocean-postgres-connection-string
PAYLOAD_SECRET=your-long-random-secret
SERVER_URL=${{RAILWAY_PUBLIC_DOMAIN}}
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
PORT=3001
```

**Important:**
- Use `${{RAILWAY_PUBLIC_DOMAIN}}` for SERVER_URL (Railway auto-fills this)
- DATABASE_URI must include `?sslmode=require`

### 5. Generate Domain

1. Go to Settings tab
2. Click "Generate Domain"
3. Railway will give you a public URL like: `your-app.up.railway.app`

### 6. Deploy

Railway automatically deploys when you push to GitHub!

## Update Frontend to Use Railway CMS

In your frontend `.env`:
```
VITE_API_URL=https://your-app.up.railway.app
```

## Monitoring

- **Logs**: Click on your service → View logs
- **Metrics**: See CPU, memory, network usage
- **Deployments**: View build history and rollback if needed

## Cost

- **Free tier**: $5 credit/month
- **Typical PayloadCMS usage**: $3-5/month
- **No credit card needed** for free tier

## Troubleshooting

### Build Fails
Check build logs in Railway dashboard. Most common issues:
- Missing environment variables
- Wrong root directory

### Database Connection Error
- Verify DATABASE_URI is correct
- Must end with `?sslmode=require`
- Check Digital Ocean firewall allows Railway IPs

### Can't Access Admin
- Check SERVER_URL is set to `${{RAILWAY_PUBLIC_DOMAIN}}`
- Verify CORS settings in payload.config.ts include your domain

## Alternative: Render.com

If Railway doesn't work, try Render.com (also free):
1. Go to https://render.com
2. Create new "Web Service"
3. Connect GitHub repo
4. Same environment variables as above
5. Free tier: 512MB RAM (slower but works)
