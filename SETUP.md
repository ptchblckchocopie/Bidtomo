# Marketplace Platform - Setup Guide

This guide will help you set up the marketplace platform on your local machine.

## Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **PostgreSQL 14+** - [Download here](https://www.postgresql.org/download/)
3. **Git** (optional, for version control)

## Step-by-Step Setup

### 1. Install PostgreSQL

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### macOS
```bash
brew install postgresql@14
brew services start postgresql@14
```

#### Windows
Download and install from [PostgreSQL Downloads](https://www.postgresql.org/download/windows/)

### 2. Create Database

**Easy Way (Recommended):**
```bash
./setup-db.sh
```

This script will:
- Check if PostgreSQL is installed and running
- Automatically create the `marketplace` database
- Handle different PostgreSQL authentication methods
- Provide helpful error messages if something goes wrong

**Manual Way:**
```bash
# Switch to postgres user (Linux/macOS)
sudo -u postgres psql

# Or connect directly (if you have a postgres user)
psql -U postgres

# In the PostgreSQL prompt, create the database:
CREATE DATABASE marketplace;

# Create a user (optional, if you want a dedicated user)
CREATE USER marketplace_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE marketplace TO marketplace_user;

# Exit
\q
```

Alternatively, use the `createdb` command:
```bash
createdb marketplace
```

### 3. Configure Environment Variables

The environment files are already created with working defaults for local development:

#### Backend (`cms/.env`)

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/marketplace

# PayloadCMS Secret Key (already generated)
PAYLOAD_SECRET=a61dfa584654666a49675f4c5fd77812c2e47622072f1c65eb48d32b973c7625

# Server Configuration
PORT=3001
SERVER_URL=http://localhost:3001

# Node Environment
NODE_ENV=development
```

**Important:** Update `DATABASE_URL` if your PostgreSQL setup is different:
- Replace `postgres:postgres` with `username:password`
- Change `localhost:5432` if using a different host/port
- Change `marketplace` if you used a different database name

#### Frontend (`frontend/.env`)

```env
# Public environment variables (accessible in browser)
PUBLIC_API_URL=http://localhost:3001

# Server-side only environment variables
VITE_API_URL=http://localhost:3001
```

### 4. Verify PostgreSQL Connection

Test your database connection:

```bash
# Test connection with psql
psql -U postgres -d marketplace -c "SELECT version();"

# Or with the DATABASE_URL format
psql postgresql://postgres:postgres@localhost:5432/marketplace -c "SELECT 1;"
```

You should see the PostgreSQL version or a result if the connection works.

### 5. Install Dependencies

The `start.sh` script will install dependencies automatically, but you can install them manually:

```bash
# Backend dependencies
cd cms
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### 6. Start the Application

Use the automated start script:

```bash
chmod +x start.sh
./start.sh
```

Or start manually:

```bash
# Terminal 1 - Backend
cd cms
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 7. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api
- **Admin Panel**: http://localhost:3001/admin

### 8. Create Your First Admin User

1. Go to http://localhost:3001/admin
2. You'll be prompted to create the first user
3. Fill in:
   - Email
   - Password
   - Name
   - Role: Select "Admin"
4. Click "Create"

## Environment Variables Reference

### Backend (`cms/.env`)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/marketplace` | Yes |
| `PAYLOAD_SECRET` | Secret key for JWT and encryption | Auto-generated | Yes |
| `PORT` | Backend server port | `3001` | No |
| `SERVER_URL` | Backend server URL | `http://localhost:3001` | No |
| `NODE_ENV` | Node environment | `development` | No |

**Database URL Format:**
```
postgresql://[username]:[password]@[host]:[port]/[database]
```

Examples:
- Local: `postgresql://postgres:postgres@localhost:5432/marketplace`
- Supabase: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`
- Railway: `postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/railway`
- Neon: `postgresql://[USER]:[PASSWORD]@[HOST]/[DATABASE]?sslmode=require`

### Frontend (`frontend/.env`)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PUBLIC_API_URL` | Public API URL (accessible in browser) | `http://localhost:3001` | No |
| `VITE_API_URL` | API URL for Vite proxy | `http://localhost:3001` | No |

## Common Issues & Troubleshooting

### Issue: "Connection refused" or database connection error

**Solution:**
1. Check if PostgreSQL is running:
   ```bash
   sudo systemctl status postgresql  # Linux
   brew services list  # macOS
   ```

2. Verify PostgreSQL is listening on port 5432:
   ```bash
   sudo netstat -plnt | grep 5432
   ```

3. Check your `DATABASE_URL` credentials are correct

4. Try connecting manually:
   ```bash
   psql -U postgres -d marketplace
   ```

### Issue: "relation does not exist" errors

**Solution:**
PayloadCMS will create tables automatically on first run. Just restart the backend:
```bash
cd cms
npm run dev
```

### Issue: Port 3001 or 5173 already in use

**Solution:**
1. Find and kill the process:
   ```bash
   lsof -ti:3001 | xargs kill -9  # Backend
   lsof -ti:5173 | xargs kill -9  # Frontend
   ```

2. Or change the port in `.env` files

### Issue: "Cannot find module" errors

**Solution:**
Delete node_modules and reinstall:
```bash
cd cms
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

### Issue: PayloadCMS admin panel not loading

**Solution:**
1. Check backend logs in `.logs/cms.log`
2. Ensure database connection is working
3. Clear browser cache and reload
4. Check `PAYLOAD_SECRET` is set in `cms/.env`

## Production Deployment

For production deployment, you'll need to:

1. **Use a managed PostgreSQL service:**
   - [Supabase](https://supabase.com/) (Free tier available)
   - [Railway](https://railway.app/) (Free tier available)
   - [Neon](https://neon.tech/) (Free tier available)
   - AWS RDS
   - Google Cloud SQL

2. **Update environment variables:**
   - Set `DATABASE_URL` to your production database
   - Generate a new `PAYLOAD_SECRET` (use: `openssl rand -hex 32`)
   - Set `NODE_ENV=production`
   - Update `SERVER_URL` to your production URL

3. **Deploy backend:**
   - Railway, Heroku, or DigitalOcean for Node.js apps
   - Ensure environment variables are set
   - Run migrations if needed

4. **Deploy frontend:**
   - Vercel (recommended for SvelteKit)
   - Netlify
   - Update `PUBLIC_API_URL` to production backend URL

## Next Steps

1. ✓ Database and environment configured
2. ✓ Application running locally
3. ✓ Admin user created
4. → Start building your marketplace features!

See [PLANNING.md](./PLANNING.md) for feature planning and development roadmap.
