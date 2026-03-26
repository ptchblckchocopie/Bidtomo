# Backend Dockerfile for PayloadCMS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Accept build arguments with defaults for local development
ARG SERVER_URL=http://localhost:3001
ARG DATABASE_URL=postgresql://localhost:5432/marketplace
ARG PAYLOAD_SECRET=dev-secret-change-in-production

# Set environment variables for build
ENV SERVER_URL=${SERVER_URL}
ENV DATABASE_URL=${DATABASE_URL}
ENV PAYLOAD_SECRET=${PAYLOAD_SECRET}

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

# Copy package files and postinstall script
COPY package*.json postinstall.js ./

# Explicitly install ALL dependencies including devDependencies
# Unset NODE_ENV to ensure devDependencies are installed
RUN NODE_ENV=development npm ci --include=dev --legacy-peer-deps

# Copy source code
COPY . .

# Build TypeScript and Payload admin (SERVER_URL is now available)
RUN npm run build

# Create media directory and set ownership
RUN mkdir -p media && chown -R node:node /app

# Set environment to production (after build)
ENV NODE_ENV=production

# Run as non-root
USER node

# Expose port (Railway uses PORT env var, defaults to 3001)
EXPOSE 3001

# Start the application in production mode (includes migration run)
CMD ["npm", "start"]
