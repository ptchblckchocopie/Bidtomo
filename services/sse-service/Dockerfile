# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Runtime (production deps only)
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

RUN chown -R node:node /app
USER node
EXPOSE 3002
CMD ["npm", "start"]
