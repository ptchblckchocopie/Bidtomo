# Frontend Dockerfile (local dev + optional production build)
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (deterministic)
RUN npm ci

# Copy source code
COPY . .

# Set ownership for non-root user
RUN chown -R node:node /app

USER node
EXPOSE 5173

# Start the application in development mode
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
