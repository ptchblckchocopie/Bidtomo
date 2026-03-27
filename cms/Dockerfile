# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

ARG SERVER_URL=http://localhost:3001
ARG DATABASE_URL=postgresql://localhost:5432/marketplace
ARG PAYLOAD_SECRET=dev-secret-change-in-production
ARG GIT_SHA=unknown

ENV SERVER_URL=${SERVER_URL}
ENV DATABASE_URL=${DATABASE_URL}
ENV PAYLOAD_SECRET=${PAYLOAD_SECRET}
ENV GIT_SHA=${GIT_SHA}

COPY package*.json postinstall.js ./
RUN NODE_ENV=development npm ci --include=dev --legacy-peer-deps

COPY . .
RUN npm run build

# Stage 2: Runtime (production deps only)
FROM node:20-alpine
WORKDIR /app

COPY package*.json postinstall.js ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build
COPY --from=builder /app/src/migrations ./src/migrations
COPY --from=builder /app/src/emptyModule.js ./src/emptyModule.js

# Create media directory and set ownership
RUN mkdir -p media && chown -R node:node /app

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
ENV NODE_ENV=production
ENV PAYLOAD_CONFIG_PATH=dist/payload.config.js

USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
