FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 3002

CMD ["npm", "start"]
