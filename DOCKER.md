# Docker Setup Guide

Run the entire Marketplace Platform with Docker - no need to install PostgreSQL or Node.js locally!

## Prerequisites

Only Docker is required:
- **Docker** - [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** - Usually comes with Docker Desktop

## Quick Start

### 1. Install Docker

**Ubuntu/Debian:**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (to run without sudo)
sudo usermod -aG docker $USER

# Log out and log back in, then verify
docker --version
docker-compose --version
```

**macOS:**
```bash
# Install Docker Desktop from:
# https://docs.docker.com/desktop/install/mac-install/

# Or use Homebrew
brew install --cask docker
```

**Windows:**
Download and install [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)

### 2. Start the Application

```bash
./start-docker.sh
```

That's it! The script will:
- ✓ Build all Docker images
- ✓ Start PostgreSQL database
- ✓ Start PayloadCMS backend
- ✓ Start SvelteKit frontend
- ✓ Show all service URLs

### 3. Access the Application

- **Frontend**: http://localhost:5173
- **Admin Panel**: http://localhost:3001/admin
- **API**: http://localhost:3001/api

### 4. Create Your First Admin User

1. Go to http://localhost:3001/admin
2. Fill in the registration form
3. Select "Admin" role
4. Click "Create"

## Architecture

The Docker setup includes 3 services:

```
┌─────────────────┐
│   Frontend      │
│  (SvelteKit)    │
│  Port: 5173     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Backend       │
│  (PayloadCMS)   │
│  Port: 3001     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Database      │
│  (PostgreSQL)   │
│  Port: 5433     │
│  (host) / 5432  │
│  (container)    │
└─────────────────┘
```

**Note:** PostgreSQL runs on port 5433 on your host machine to avoid conflicts with any existing PostgreSQL installation on port 5432. Inside the Docker network, it uses the standard port 5432.

## Docker Commands

**Note:** Depending on your Docker version, use either `docker-compose` (older) or `docker compose` (newer). The start script automatically detects which one to use.

### Start Services
```bash
# Using the script (recommended)
./start-docker.sh

# Or manually (newer Docker)
docker compose up -d

# Or manually (older Docker)
docker-compose up -d
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Stop Services
```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (WARNING: deletes database data!)
docker-compose down -v
```

### Restart Services
```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart backend
```

### Rebuild Containers
```bash
# Rebuild and restart
docker-compose up --build -d

# Rebuild specific service
docker-compose up --build -d backend
```

### Check Status
```bash
docker-compose ps
```

### Access Container Shell
```bash
# Backend container
docker-compose exec backend sh

# PostgreSQL container
docker-compose exec postgres psql -U postgres -d marketplace
```

## Development Workflow

### Hot Reload

Both frontend and backend support hot reload in development mode:
- **Backend**: Edit files in `cms/src/` and changes will auto-reload
- **Frontend**: Edit files in `frontend/src/` and changes will auto-reload

### Database Management

**Connect to database:**
```bash
# From inside the container
docker compose exec postgres psql -U postgres -d marketplace

# Or from your host machine (port 5433)
psql -h localhost -p 5433 -U postgres -d marketplace
```

**Backup database:**
```bash
docker-compose exec postgres pg_dump -U postgres marketplace > backup.sql
```

**Restore database:**
```bash
docker-compose exec -T postgres psql -U postgres marketplace < backup.sql
```

**Reset database:**
```bash
# Stop services
docker-compose down

# Remove database volume
docker volume rm marketplace-platform_postgres_data

# Start services (will create fresh database)
docker-compose up -d
```

## Environment Variables

Environment variables are configured in `docker-compose.yml`. To modify:

1. Edit `docker-compose.yml`
2. Update the `environment` section for each service
3. Restart: `docker-compose restart`

**Important variables:**

**Backend:**
- `DATABASE_URL`: PostgreSQL connection string
- `PAYLOAD_SECRET`: Secret key for JWT
- `PORT`: Backend port (default: 3001)
- `SERVER_URL`: Backend URL

**Frontend:**
- `PUBLIC_API_URL`: API URL for browser
- `VITE_API_URL`: API URL for Vite proxy

## Troubleshooting

### Port Already in Use

If ports 3001, 5173, or 5432 are already in use:

1. Edit `docker-compose.yml`
2. Change the port mappings:
   ```yaml
   ports:
     - "NEW_PORT:CONTAINER_PORT"
   ```
3. Restart: `docker-compose up -d`

### Container Won't Start

```bash
# Check logs
docker-compose logs backend

# Rebuild from scratch
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Connection Error

```bash
# Check if PostgreSQL is healthy
docker-compose ps

# Wait for database to be ready
docker-compose up -d postgres
sleep 10
docker-compose up -d backend
```

### Changes Not Reflecting

```bash
# Rebuild the container
docker-compose up --build -d backend

# Or restart the service
docker-compose restart backend
```

### Clean Start

```bash
# Stop everything and remove volumes
docker-compose down -v

# Remove all images
docker-compose down --rmi all

# Start fresh
./start-docker.sh
```

## Production Deployment

For production, you should:

1. **Build production images:**
   - Update Dockerfiles to use production builds
   - Use multi-stage builds for smaller images

2. **Use environment variables:**
   - Don't hardcode secrets
   - Use Docker secrets or env files

3. **Use a reverse proxy:**
   - Nginx or Traefik in front
   - SSL/TLS certificates

4. **Database:**
   - Use managed PostgreSQL (not Docker)
   - Or use Docker volumes with backup strategy

5. **Orchestration:**
   - Consider Kubernetes for scaling
   - Or Docker Swarm for simpler deployments

Example production docker-compose snippet:
```yaml
services:
  backend:
    build:
      context: ./cms
      target: production
    env_file:
      - .env.production
    restart: always
```

## Benefits of Docker Setup

✅ **No local dependencies** - No need to install PostgreSQL, Node.js locally
✅ **Consistent environment** - Same setup on all machines
✅ **Easy cleanup** - `docker-compose down` removes everything
✅ **Isolated** - Doesn't interfere with other projects
✅ **Production-ready** - Easy to deploy to any Docker host

## Next Steps

1. ✓ Docker setup complete
2. ✓ All services running
3. ✓ Admin user created
4. → Start building your marketplace features!

See [PLANNING.md](./PLANNING.md) for feature planning and development roadmap.
