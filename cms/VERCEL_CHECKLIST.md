# Vercel Deployment Checklist

Before deploying, verify these settings:

## ✅ Vercel Project Settings

### General
- [ ] **Root Directory** is set to `cms`
- [ ] **Framework Preset** is set to "Other" or leave auto-detect

### Build & Output
- [ ] **Build Command**: Leave default (auto-detects `npm run vercel-build`)
- [ ] **Output Directory**: Leave empty
- [ ] **Install Command**: `npm install`

### Environment Variables
Add these in Settings → Environment Variables:

- [ ] `DATABASE_URI` - Your Digital Ocean PostgreSQL URL with `?sslmode=require`
- [ ] `PAYLOAD_SECRET` - Long random string (32+ chars)
- [ ] `SERVER_URL` - Your Vercel CMS URL (e.g., `https://your-cms.vercel.app`)
- [ ] `FRONTEND_URL` - Your frontend URL
- [ ] `NODE_ENV` - Set to `production`
- [ ] `VERCEL` - Set to `1`

**Example DATABASE_URI:**
```
postgresql://doadmin:password@db-postgresql-nyc3-12345-do-user-1234567-0.b.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

## ✅ Local Files to Verify

- [ ] `.vercelignore` does NOT exclude `src/` directory
- [ ] `api/index.js` exists in `/cms/api/` directory
- [ ] `vercel.json` exists in `/cms/` directory
- [ ] `package.json` has `vercel-build` script
- [ ] All changes are committed to Git

## ✅ Build Test (Optional)

Test locally before deploying:

```bash
cd cms
npm install
npm run vercel-build
```

This should:
1. Compile TypeScript (`tsc`)
2. Build Payload admin UI (`payload build`)
3. Create `dist/` folder with compiled files

## 🚀 Deploy

Once all checked:

```bash
git add .
git commit -m "Configure for Vercel deployment"
git push
```

Or deploy directly:
```bash
vercel --prod
```

## 📋 After Deployment

Check Vercel deployment logs:
1. Go to your deployment in Vercel dashboard
2. Click on the deployment
3. Check "Building" tab for build logs
4. Check "Functions" tab for runtime logs

## 🐛 If Build Fails

### Error: "No inputs were found in config file"
- The `src/` directory is missing or excluded
- Check `.vercelignore` - make sure `src` is NOT listed
- Verify `src/` directory exists in your repo

### Error: "Cannot find module '../dist/server.js'"
- Build didn't complete successfully
- Check TypeScript compilation errors
- Make sure `tsc` runs without errors

### Error: "PAYLOAD_SECRET is required"
- Environment variable not set in Vercel
- Go to Settings → Environment Variables
- Add `PAYLOAD_SECRET` with a random string

### Database Connection Error
- Check `DATABASE_URI` is correct
- Make sure it ends with `?sslmode=require`
- Verify your Digital Ocean database accepts connections from `0.0.0.0/0`
- Check database credentials are correct
