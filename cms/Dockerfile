# Backend Dockerfile for PayloadCMS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Explicitly install ALL dependencies including devDependencies
# Unset NODE_ENV to ensure devDependencies are installed
RUN NODE_ENV=development npm ci --include=dev --legacy-peer-deps

# Copy source code
COPY . .

# Build TypeScript and Payload admin
RUN npm run build

# Generate migrations (if migrations directory doesn't exist, create initial migration)
RUN npx cross-env PAYLOAD_CONFIG_PATH=dist/payload.config.js payload migrate:create || true

# Create media directory
RUN mkdir -p media

# Set environment to production (after build)
ENV NODE_ENV=production

# Expose port (Railway uses PORT env var, defaults to 3001)
EXPOSE 3001

# Start the application in production mode (includes migration run)
CMD ["npm", "start"]
