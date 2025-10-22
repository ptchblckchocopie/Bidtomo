# Backend Dockerfile for PayloadCMS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install dependencies (production-ready)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build TypeScript and Payload admin
RUN npm run build

# Create media directory
RUN mkdir -p media

# Expose port (Railway uses PORT env var, defaults to 3001)
EXPOSE 3001

# Start the application in production mode
CMD ["npm", "start"]
