# Quick Start Guide

Get the Marketplace Platform running in 3 steps!

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ installed

## Steps

### 1. Install PostgreSQL (if not already installed)

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# macOS
brew install postgresql@14
brew services start postgresql@14
```

### 2. Create the Database

```bash
./setup-db.sh
```

If you get an error, the script will provide instructions on how to fix it.

### 3. Start the Application

```bash
./start.sh
```

The script will:
- Install all dependencies automatically
- Start the backend on http://localhost:3001
- Start the frontend on http://localhost:5173

### 4. Create Your First Admin User

1. Open http://localhost:3001/admin in your browser
2. Fill in the registration form:
   - Email
   - Password
   - Name
   - Role: Select "Admin"
3. Click "Create"

## You're Done!

- **Frontend**: http://localhost:5173
- **Admin Panel**: http://localhost:3001/admin
- **API**: http://localhost:3001/api

## Troubleshooting

### PostgreSQL not installed?

The `setup-db.sh` script will tell you how to install it.

### Database connection error?

Check that PostgreSQL is running:
```bash
sudo systemctl status postgresql  # Linux
brew services list | grep postgresql  # macOS
```

### Can't create database?

Try manually:
```bash
sudo -u postgres psql -c "CREATE DATABASE marketplace;"
```

### Port already in use?

Kill existing processes:
```bash
lsof -ti:3001 | xargs kill -9  # Backend
lsof -ti:5173 | xargs kill -9  # Frontend
```

## Need More Help?

- [Full Setup Guide](./SETUP.md) - Detailed setup instructions
- [Planning Document](./PLANNING.md) - Feature planning and architecture
- [README](./README.md) - Complete project documentation
