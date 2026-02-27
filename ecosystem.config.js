module.exports = {
  apps: [
    {
      name: 'cms',
      cwd: './cms',
      script: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:changeme123@localhost:5432/marketplace',
        PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        SERVER_URL: process.env.SERVER_URL || 'https://app.bidmo.to',
        FRONTEND_URL: process.env.FRONTEND_URL || 'https://www.bidmo.to',
        S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
        S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
        S3_REGION: process.env.S3_REGION || 'sgp1',
        S3_ENDPOINT: process.env.S3_ENDPOINT || 'https://sgp1.digitaloceanspaces.com',
        S3_BUCKET: process.env.S3_BUCKET || 'veent'
      }
    },
    {
      name: 'frontend',
      cwd: './frontend',
      script: 'build/index.js',
      env: {
        NODE_ENV: 'production',
        ORIGIN: process.env.ORIGIN || 'https://www.bidmo.to',
        PUBLIC_API_URL: process.env.PUBLIC_API_URL || 'https://app.bidmo.to',
        PUBLIC_CMS_URL: process.env.PUBLIC_CMS_URL || 'https://app.bidmo.to',
        CMS_URL: process.env.CMS_URL || 'http://localhost:3001',
        PUBLIC_SSE_URL: process.env.PUBLIC_SSE_URL || 'https://www.bidmo.to/api/sse',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        BODY_SIZE_LIMIT: '104857600'
      }
    },
    {
      name: 'sse',
      cwd: './services/sse-service',
      script: 'dist/index.js',
      env: {
        PORT: 3002,
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        CMS_URL: process.env.CMS_URL || 'http://localhost:3001',
        SSE_CORS_ORIGIN: process.env.SSE_CORS_ORIGIN || 'https://www.bidmo.to'
      }
    },
    {
      name: 'worker',
      cwd: './services/bid-worker',
      script: 'dist/index.js',
      env: {
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        CMS_URL: process.env.CMS_URL || 'http://localhost:3001',
        DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:changeme123@localhost:5432/marketplace'
      }
    }
  ]
};
