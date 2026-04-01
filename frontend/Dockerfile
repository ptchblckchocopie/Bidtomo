# Frontend Dockerfile — local dev & staging only.
# Production deploys to Vercel directly from git (not via Docker).

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime (production deps only)
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built output from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json

RUN chown -R node:node /app

USER node
EXPOSE 3000

# For local dev, override CMD with: npm run dev -- --host 0.0.0.0
CMD ["node", "build/index.js"]
