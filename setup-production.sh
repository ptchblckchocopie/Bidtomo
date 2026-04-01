
  #!/bin/bash
  set -e

  GREEN='\033[0;32m'
  BLUE='\033[0;34m'
  NC='\033[0m'

  APP_DIR="/var/www/marketplace"
  DB_PASSWORD="${POSTGRES_PASSWORD:?Error: POSTGRES_PASSWORD environment variable must be set}"

  echo -e "${BLUE}==> Installing dependencies...${NC}"
  cd $APP_DIR/cms && npm install --legacy-peer-deps
  cd $APP_DIR/frontend && npm install --legacy-peer-deps
  cd $APP_DIR/services/sse-service && npm install
  cd $APP_DIR/services/bid-worker && npm install
  echo -e "${GREEN}✓ Dependencies installed${NC}"

  echo -e "${BLUE}==> Creating .env files...${NC}"
  cat > $APP_DIR/cms/.env << EOF
  DATABASE_URL=postgresql://postgres:$DB_PASSWORD@localhost:5432/marketplace
  PAYLOAD_SECRET=***REMOVED***
  PORT=3001
  NODE_ENV=production
  REDIS_URL=redis://localhost:6379
  EOF

  cat > $APP_DIR/frontend/.env << EOF
  PUBLIC_API_URL=http://localhost:3001
  PUBLIC_CMS_URL=http://localhost:3001
  PUBLIC_SSE_URL=http://localhost:3002
  REDIS_URL=redis://localhost:6379
  NODE_ENV=production
  ORIGIN=http://localhost:3000
  EOF

  cat > $APP_DIR/services/sse-service/.env << EOF
  PORT=3002
  REDIS_URL=redis://localhost:6379
  CMS_URL=http://localhost:3001
  EOF

  cat > $APP_DIR/services/bid-worker/.env << EOF
  REDIS_URL=redis://localhost:6379
  CMS_URL=http://localhost:3001
  DATABASE_URL=postgresql://postgres:$DB_PASSWORD@localhost:5432/marketplace
  EOF
  echo -e "${GREEN}✓ Environment files created${NC}"

  echo -e "${BLUE}==> Building applications...${NC}"
  cd $APP_DIR/cms && npm run build
  cd $APP_DIR/frontend && npm run build
  cd $APP_DIR/services/sse-service && npm run build
  cd $APP_DIR/services/bid-worker && npm run build
  echo -e "${GREEN}✓ Applications built${NC}"

  echo -e "${BLUE}==> Starting services with PM2...${NC}"
  cd $APP_DIR
  pm2 delete all 2>/dev/null || true
  pm2 start npm --name "cms" --cwd ./cms -- run serve
  pm2 start node --name "frontend" --cwd ./frontend -- build/index.js
  pm2 start node --name "sse" --cwd ./services/sse-service -- dist/index.js
  pm2 start node --name "worker" --cwd ./services/bid-worker -- dist/index.js
  pm2 save
  pm2 startup systemd -u root --hp /root

  echo -e "${GREEN}✓ All services started!${NC}"
  pm2 status

  IP=$(curl -s ifconfig.me)
  echo ""
  echo -e "${GREEN}Access your site at: http://$IP${NC}"
  echo -e "${GREEN}CMS Admin at: http://$IP:3001/admin${NC}"

