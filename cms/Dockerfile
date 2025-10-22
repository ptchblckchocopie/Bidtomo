# Backend Dockerfile for PayloadCMS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Accept build arguments (Railway passes these automatically)
ARG RAILWAY_PUBLIC_DOMAIN
ARG DATABASE_URL
ARG PAYLOAD_SECRET

# Set environment variables for build
# Use Railway's public domain to construct SERVER_URL
ENV SERVER_URL=https://${RAILWAY_PUBLIC_DOMAIN}
ENV DATABASE_URL=${DATABASE_URL}
ENV PAYLOAD_SECRET=${PAYLOAD_SECRET}

# Copy package files
COPY package*.json ./

# Explicitly install ALL dependencies including devDependencies
# Unset NODE_ENV to ensure devDependencies are installed
RUN NODE_ENV=development npm ci --include=dev --legacy-peer-deps

# Copy source code
COPY . .

# Build TypeScript and Payload admin (SERVER_URL is now available)
RUN npm run build

# Create media directory
RUN mkdir -p media

# Set environment to production (after build)
ENV NODE_ENV=production

# Expose port (Railway uses PORT env var, defaults to 3001)
EXPOSE 3001

# Start the application in production mode (includes migration run)
CMD ["npm", "start"]
