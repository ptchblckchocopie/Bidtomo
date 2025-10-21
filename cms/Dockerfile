# Backend Dockerfile for PayloadCMS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create media directory
RUN mkdir -p media

# Expose port
EXPOSE 3001

# Start the application in development mode
CMD ["npm", "run", "dev"]
