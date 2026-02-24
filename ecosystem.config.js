module.exports = {
  apps: [
    {
      name: 'cms',
      cwd: './cms',
      script: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DATABASE_URL: 'postgresql://postgres:changeme123@localhost:5432/marketplace',
        PAYLOAD_SECRET: 'supersecretkey1234567890abcdef',
        REDIS_URL: 'redis://localhost:6379',
        SERVER_URL: 'https://app.bidmo.to',
        FRONTEND_URL: 'https://www.bidmo.to',
        S3_ACCESS_KEY_ID: 'DO00FATHCD4N7XWJWLHC',
        S3_SECRET_ACCESS_KEY: 'gVfCrrjqn0RWE0/GkrMYOWU9wHdXMoCL8kNx1gp6UK8',
        S3_REGION: 'sgp1',
        S3_ENDPOINT: 'https://sgp1.digitaloceanspaces.com',
        S3_BUCKET: 'veent'
      }
    },
    {
      name: 'frontend',
      cwd: './frontend',
      script: 'build/index.js',
      env: {
        NODE_ENV: 'production',
        ORIGIN: 'https://www.bidmo.to',
        PUBLIC_API_URL: 'https://app.bidmo.to',
        PUBLIC_CMS_URL: 'https://app.bidmo.to',
        CMS_URL: 'http://localhost:3001',
        PUBLIC_SSE_URL: 'https://www.bidmo.to/api/sse',
        REDIS_URL: 'redis://localhost:6379',
        BODY_SIZE_LIMIT: '104857600'
      }
    },
    {
      name: 'sse',
      cwd: './services/sse-service',
      script: 'dist/index.js',
      env: {
        PORT: 3002,
        REDIS_URL: 'redis://localhost:6379',
        CMS_URL: 'http://localhost:3001',
        SSE_CORS_ORIGIN: 'https://www.bidmo.to'
      }
    },
    {
      name: 'worker',
      cwd: './services/bid-worker',
      script: 'dist/index.js',
      env: {
        REDIS_URL: 'redis://localhost:6379',
        CMS_URL: 'http://localhost:3001',
        DATABASE_URL: 'postgresql://postgres:changeme123@localhost:5432/marketplace'
      }
    }
  ]
};
