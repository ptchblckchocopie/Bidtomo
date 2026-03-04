import './instrument';
import * as Sentry from '@sentry/node';
import express from 'express';
import payload from 'payload';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import { publishProductUpdate, publishMessageNotification, publishGlobalEvent } from './redis';
import { ensureProductIndex, indexProduct, updateProductIndex, isElasticAvailable } from './services/elasticSearch';
import { startBackupScheduler } from './services/backupService';
import { loginLimiter, registrationLimiter } from './limiters';
import { runPreInitMigrations } from './migrations/preInit';
import { runPostInitMigrations } from './migrations/postInit';
import { createAdminRouter } from './routes/admin';
import { createUsersRouter } from './routes/users';
import { createAnalyticsTrackRouter, createAnalyticsDashboardRouter } from './routes/analytics';
import { createBidsRouter } from './routes/bids';
import { createVoidRequestsRouter } from './routes/voidRequests';
import { createSearchRouter } from './routes/search';
import { createHealthRouter } from './routes/health';
import { createProductsRouter } from './routes/products';
import { createTypingRouter } from './routes/typing';
import { createMiscRouter } from './routes/misc';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Railway/reverse proxy) — required for express-rate-limit
const PORT = parseInt(process.env.PORT || '3001', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Configure CORS to allow requests from the frontend (including production URLs)
const allowedOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:3000',
  'https://bidmo.to',
  'https://www.bidmo.to',
  'https://app.bidmo.to',
  'http://bidmo.to',
  'http://www.bidmo.to',
  'http://app.bidmo.to',
  'https://cms-production-d0f7.up.railway.app',
  'https://cms-staging-v2.up.railway.app',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // In production, reject requests with no origin (prevents CORS bypass via curl/file:// URIs)
    // In development, allow for tools like Postman
    if (!origin) {
      return callback(null, !isProduction);
    }

    // Allow local network IPs for development only
    if (!isProduction) {
      if (origin.match(/^http:\/\/192\.168\.\d+\.\d+:\d+$/)) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-JSON'],
  maxAge: 86400, // 24 hours
}));

// Explicitly handle OPTIONS requests for preflight
app.options('*', cors());

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Payload admin panel manages its own CSP
  crossOriginEmbedderPolicy: false, // Allow cross-origin media loading
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow frontend to load media files
}));

// Parse JSON body with explicit size limit
app.use(express.json({ limit: '1mb' }));

// Apply rate limiters to Payload's built-in auth endpoints
app.use('/api/users/login', loginLimiter);
app.use('/api/users', (req, res, next) => {
  // Only rate limit POST (registration), not GET (list users)
  if (req.method === 'POST') return registrationLimiter(req, res, next);
  next();
});

// ── Pre-init routes ──
// Analytics track (uses JWT directly, no req.payload needed)
app.use(createAnalyticsTrackRouter({ payload }));

const start = async () => {
  const config = require('./payload.config').default;

  // Track payload readiness for the admin guard middleware
  let payloadReady = false;

  // ── Pre-init routers (must shadow Payload's routes) ──
  app.use(createAdminRouter({ payload, payloadReady: () => payloadReady }));
  app.use(createUsersRouter({ payload, isProduction }));

  // ── Pre-init migration: ratings table ──
  try {
    const { Pool: PrePool } = require('pg');
    const prePool = new PrePool({ connectionString: process.env.DATABASE_URI });
    await runPreInitMigrations(prePool);
    await prePool.end();
  } catch (preErr: any) {
    console.error('Pre-init pool error:', preErr.message);
  }

  // ── Initialize Payload ──
  await payload.init({
    secret: process.env.PAYLOAD_SECRET!,
    express: app,
    config,
    onInit: async () => {
      payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`);
    },
  });

  payloadReady = true;

  // Start automated backup scheduler
  startBackupScheduler();

  // ── Post-init migrations ──
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URI });
    await runPostInitMigrations(pool, payload.logger);
    await pool.end();
  } catch (migrationErr: any) {
    console.error('Post-init pool error:', migrationErr.message);
  }

  // ── Elasticsearch init ──
  try {
    const esAvailable = await isElasticAvailable();
    if (esAvailable) {
      await ensureProductIndex();
      payload.logger.info('Elasticsearch connected and index ready');
    } else {
      payload.logger.info('Elasticsearch not available — product search will fall back to database');
    }
  } catch (esErr: any) {
    payload.logger.error('Elasticsearch init error: ' + esErr.message);
  }

  // ── Global function assignments (used by Payload hooks) ──
  (global as any).indexProduct = indexProduct;
  (global as any).updateProductIndex = updateProductIndex;
  (global as any).publishMessageNotification = publishMessageNotification;
  (global as any).publishGlobalEvent = publishGlobalEvent;
  (global as any).publishProductUpdate = publishProductUpdate;
  (global as any).trackEvent = (eventType: string, userId?: number | string, metadata?: Record<string, any>) => {
    setImmediate(async () => {
      try {
        await payload.create({
          collection: 'user-events',
          data: {
            eventType: eventType as any,
            user: (userId as any) || undefined,
            metadata: metadata || undefined,
          },
          overrideAccess: true,
        });
      } catch (err) {
        // Silently swallow — analytics should never break anything
      }
    });
  };

  // ── Post-init routers ──
  app.use(createMiscRouter({ payload, isProduction }));
  app.use(createProductsRouter({ payload, isProduction }));
  app.use(createBidsRouter({ payload, isProduction }));
  app.use(createHealthRouter());
  app.use(createSearchRouter({ payload, isProduction }));
  app.use(createVoidRequestsRouter({ payload, isProduction }));
  app.use(createTypingRouter());
  app.use(createAnalyticsDashboardRouter({ payload, isProduction }));

  // Sentry Express error handler — must be after all routes
  Sentry.setupExpressErrorHandler(app);

  // Only start server if not in serverless environment
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
      if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_CA_CERT) {
        console.warn('[SECURITY] DATABASE_CA_CERT not set — DB SSL certificate verification is disabled. Set DATABASE_CA_CERT for full TLS verification.');
      }
    });
  }
};

// Only auto-start in local development
if (!process.env.VERCEL) {
  start();
}

// Export for Vercel serverless - export both app and start function
export { app, start };
export default app;
