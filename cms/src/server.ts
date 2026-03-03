import express from 'express';
import payload from 'payload';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { queueBid, queueAcceptBid, publishProductUpdate, publishMessageNotification, publishTypingStatus, publishGlobalEvent, isRedisConnected } from './redis';
import { queueEmail, sendVoidRequestEmail, sendVoidResponseEmail, sendAuctionRestartedEmail, sendSecondBidderOfferEmail } from './services/emailService';
import { ensureProductIndex, indexProduct, updateProductIndex, searchProducts, bulkSyncProducts, isElasticAvailable } from './services/elasticSearch';
import { startBackupScheduler, runBackup, cleanupOldBackups, isBackupInProgress } from './services/backupService';
import { authenticateJWT } from './auth-helpers';
import { requireAuth, getPayloadJwtSecret } from './middleware/requireAuth';
import { validate, bidQueueSchema, bidAcceptSchema, profilePictureSchema, voidRequestCreateSchema, voidRequestRespondSchema, voidRequestSellerChoiceSchema, voidRequestSecondBidderSchema, typingSchema, analyticsTrackSchema } from './middleware/validate';

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
}));

// Parse JSON body with explicit size limit
app.use(express.json({ limit: '1mb' }));

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const bidLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 bids per minute
  message: { error: 'Too many bid attempts. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters to Payload's built-in auth endpoints
app.use('/api/users/login', loginLimiter);
app.use('/api/users', (req, res, next) => {
  // Only rate limit POST (registration), not GET (list users)
  if (req.method === 'POST') return registrationLimiter(req, res, next);
  next();
});

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // 120 analytics requests per minute
  message: { error: 'Too many analytics requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Analytics track endpoint — registered before payload.init()
// Token is optional (anonymous page views allowed)
app.post('/api/analytics/track', analyticsLimiter, validate(analyticsTrackSchema), async (req, res) => {
  try {
    // Extract user ID from JWT if present (optional auth)
    let userId: number | string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const user = await authenticateJWT(req);
        if (user) userId = (user as any).id;
      } catch {
        // Anonymous is fine
      }
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const { events } = req.body;

    // Fire-and-forget: write events without blocking response
    setImmediate(async () => {
      for (const event of events) {
        try {
          await payload.create({
            collection: 'user-events',
            data: {
              eventType: event.eventType,
              user: userId || undefined,
              page: event.page,
              metadata: event.metadata,
              sessionId: event.sessionId,
              deviceInfo: event.deviceInfo,
              referrer: event.referrer,
              ip,
            },
            overrideAccess: true,
          });
        } catch {
          // Silently swallow
        }
      }
    });

    res.json({ success: true });
  } catch {
    // Always return success — analytics should never fail visibly
    res.json({ success: true });
  }
});

const start = async () => {
  // Import config directly
  const config = require('./payload.config').default;

  // Track payload readiness for the admin guard middleware
  let payloadReady = false;

  // Access denied page for non-admin users
  const FROG_VIDEO_URL = `${process.env.SUPABASE_URL || 'https://htcdkqplcmdbyjlvzono.supabase.co'}/storage/v1/object/public/${process.env.S3_BUCKET || 'bidmo-media'}/bidmoto/frog.mp4`;

  app.get('/admin/access-denied', (req, res) => {
    res.clearCookie('payload-token');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied - Bidmo.to CMS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #000; overflow: hidden; }
    .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 10; }
    video { max-width: 80vw; max-height: 80vh; border-radius: 12px; box-shadow: 0 0 80px rgba(0,0,0,0.8); }
    .text-overlay { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); text-align: center; z-index: 20; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .text-overlay h1 { font-size: 1.3rem; color: #fff; margin-bottom: 0.5rem; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
    .text-overlay p { font-size: 0.85rem; color: rgba(255,255,255,0.6); text-shadow: 0 1px 4px rgba(0,0,0,0.8); }
  </style>
</head>
<body>
  <div class="overlay">
    <video autoplay loop muted playsinline>
      <source src="${FROG_VIDEO_URL}" type="video/mp4">
    </video>
  </div>
  <div class="text-overlay">
    <h1>Access Denied</h1>
    <p>Only admin accounts can access this panel.</p>
  </div>
</body>
</html>`);
  });

  // Guard: auto-logout non-admin users from admin panel
  app.use('/admin', async (req, res, next) => {
    if (!payloadReady) return next();

    // Only check HTML page loads, skip assets and API calls
    const accept = req.headers.accept || '';
    if (!accept.includes('text/html')) return next();
    if (req.path === '/access-denied') return next();

    // Parse payload-token from cookie header
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/payload-token=([^;]+)/);
    if (!tokenMatch) return next();

    try {
      const token = decodeURIComponent(tokenMatch[1]);
      const decoded = jwt.verify(token, getPayloadJwtSecret()) as any;

      if (decoded?.id) {
        const user = await payload.findByID({
          collection: 'users',
          id: decoded.id,
        });

        if (user && user.role !== 'admin') {
          return res.redirect('/admin/access-denied');
        }
      }
    } catch {
      // Invalid or expired token — clear it
      res.clearCookie('payload-token');
      return res.redirect('/admin');
    }

    next();
  });

  // ── Register custom /api/users/* routes BEFORE payload.init() ──
  // Payload registers GET/DELETE /api/users/:id which would intercept
  // paths like /api/users/limits and /api/users/profile-picture.
  // Registering here ensures Express matches our routes first.
  // The `payload` singleton is resolved at request time (after init).

  app.get('/api/users/limits', requireAuth, async (req, res) => {
    try {
      const currentUserId = (req as any).userId;

      // Define maximum limits
      const MAX_BIDS = 10;
      const MAX_POSTS = 10;

      // Count active products where user has placed bids
      const userBids = await payload.find({
        collection: 'bids',
        where: {
          bidder: {
            equals: currentUserId,
          },
        },
        limit: 1000,
      });

      // Get unique product IDs from user's bids
      const bidProductIds = new Set<string>();
      userBids.docs.forEach((bid: any) => {
        const productId = typeof bid.product === 'object' ? bid.product.id : bid.product;
        bidProductIds.add(String(productId));
      });

      // Count how many of those products are still active
      let activeBidCount = 0;
      if (bidProductIds.size > 0) {
        const activeProducts = await payload.find({
          collection: 'products',
          where: {
            and: [
              {
                id: {
                  in: Array.from(bidProductIds),
                },
              },
              {
                status: { equals: 'available' },
              },
              {
                active: { equals: true },
              },
            ],
          },
          limit: 1000,
        });
        activeBidCount = activeProducts.totalDocs;
      }

      // Count active products posted by the user
      const userProducts = await payload.find({
        collection: 'products',
        where: {
          and: [
            {
              seller: {
                equals: currentUserId,
              },
            },
            {
              status: { equals: 'available' },
            },
            {
              active: { equals: true },
            },
          ],
        },
        limit: 1000,
      });

      const activePostCount = userProducts.totalDocs;

      // Calculate remaining limits
      const bidsRemaining = Math.max(0, MAX_BIDS - activeBidCount);
      const postsRemaining = Math.max(0, MAX_POSTS - activePostCount);

      res.json({
        bids: {
          current: activeBidCount,
          max: MAX_BIDS,
          remaining: bidsRemaining,
        },
        posts: {
          current: activePostCount,
          max: MAX_POSTS,
          remaining: postsRemaining,
        },
      });
    } catch (error: any) {
      console.error('Error fetching user limits:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  app.post('/api/users/profile-picture', requireAuth, validate(profilePictureSchema), async (req, res) => {
    try {
      const currentUserId = (req as any).userId;

      // Get the current user to find old profile picture
      const currentUser = await payload.findByID({
        collection: 'users',
        id: currentUserId as string,
      });

      const oldProfilePictureId = currentUser?.profilePicture
        ? (typeof currentUser.profilePicture === 'object'
          ? (currentUser.profilePicture as any).id
          : currentUser.profilePicture)
        : null;

      const { mediaId } = req.body;

      // Update user with new profile picture
      // overrideAccess bypasses access control but NOT field validation.
      // Payload v2 requires all `required` fields in the data, so include `role`.
      const updatedUser = await payload.update({
        collection: 'users',
        id: currentUserId as string,
        data: {
          profilePicture: mediaId,
        },
        overrideAccess: true,
      });

      // Delete old profile picture from media collection (which also deletes from Supabase)
      if (oldProfilePictureId && String(oldProfilePictureId) !== String(mediaId)) {
        try {
          await payload.delete({
            collection: 'media',
            id: String(oldProfilePictureId),
          });
          console.log(`Deleted old profile picture: ${oldProfilePictureId}`);
        } catch (deleteErr) {
          console.error('Failed to delete old profile picture:', deleteErr);
          // Non-fatal: the new picture is already set
        }
      }

      const trackEvent = (global as any).trackEvent;
      if (trackEvent) trackEvent('profile_picture_changed', currentUserId, { mediaId });

      res.json({
        success: true,
        user: updatedUser,
      });
    } catch (error: any) {
      console.error('Error updating profile picture:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  app.delete('/api/users/profile-picture', requireAuth, async (req, res) => {
    try {
      const currentUserId = (req as any).userId;

      // Get the current user to find the profile picture
      const currentUser = await payload.findByID({
        collection: 'users',
        id: currentUserId as string,
      });

      const profilePictureId = currentUser?.profilePicture
        ? (typeof currentUser.profilePicture === 'object'
          ? (currentUser.profilePicture as any).id
          : currentUser.profilePicture)
        : null;

      // Clear the profile picture field
      await payload.update({
        collection: 'users',
        id: currentUserId as string,
        data: {
          profilePicture: null as any,
        },
        overrideAccess: true,
      });

      // Delete the media record
      if (profilePictureId) {
        try {
          await payload.delete({
            collection: 'media',
            id: String(profilePictureId),
          });
          console.log(`Deleted profile picture: ${profilePictureId}`);
        } catch (deleteErr) {
          console.error('Failed to delete profile picture media:', deleteErr);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error removing profile picture:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Pre-init migration: ensure ratings table has all required columns before Payload queries it
  try {
    const { Pool: PrePool } = require('pg');
    const prePool = new PrePool({ connectionString: process.env.DATABASE_URI });

    // Ensure enum type exists
    await prePool.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_ratings_rater_role" AS ENUM ('buyer', 'seller');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create table if it doesn't exist at all (with correct column names)
    await prePool.query(`
      CREATE TABLE IF NOT EXISTS "ratings" (
        "id" serial PRIMARY KEY NOT NULL,
        "rating" numeric NOT NULL,
        "comment" varchar,
        "raterRole" "enum_ratings_rater_role" NOT NULL DEFAULT 'buyer',
        "follow_up_rating" numeric,
        "follow_up_comment" varchar,
        "follow_up_created_at" timestamp(3) with time zone,
        "has_follow_up" boolean,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
    `);

    // Fix legacy column: drop "score" if "rating" already exists, otherwise rename
    await prePool.query(`
      DO $$
      DECLARE has_score boolean; has_rating boolean;
      BEGIN
        SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ratings' AND column_name='score') INTO has_score;
        SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='ratings' AND column_name='rating') INTO has_rating;
        IF has_score AND has_rating THEN
          ALTER TABLE "ratings" DROP COLUMN "score";
        ELSIF has_score AND NOT has_rating THEN
          ALTER TABLE "ratings" RENAME COLUMN "score" TO "rating";
        END IF;
      END $$;
    `);

    // If table already exists but is missing columns, add them
    await prePool.query(`
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "rating" numeric;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "comment" varchar;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "follow_up_rating" numeric;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "follow_up_comment" varchar;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "follow_up_created_at" timestamp(3) with time zone;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "has_follow_up" boolean;
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp(3) with time zone DEFAULT now();
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "created_at" timestamp(3) with time zone DEFAULT now();
    `);

    // Fix rater_role → raterRole rename if old column exists
    await prePool.query(`
      DO $$ BEGIN
        ALTER TABLE "ratings" RENAME COLUMN "rater_role" TO "raterRole";
      EXCEPTION WHEN undefined_column THEN null;
      END $$;
    `);

    // Add raterRole if missing entirely
    await prePool.query(`
      ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "raterRole" "enum_ratings_rater_role" NOT NULL DEFAULT 'buyer';
    `);

    // Ensure ratings_rels table exists with all columns
    await prePool.query(`
      CREATE TABLE IF NOT EXISTS "ratings_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL REFERENCES "ratings"("id") ON DELETE CASCADE,
        "path" varchar NOT NULL,
        "transactions_id" integer REFERENCES "transactions"("id") ON DELETE CASCADE,
        "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE
      );
      ALTER TABLE "ratings_rels" ADD COLUMN IF NOT EXISTS "order" integer;
      CREATE INDEX IF NOT EXISTS "ratings_rels_order_idx" ON "ratings_rels" USING btree ("order");
      CREATE INDEX IF NOT EXISTS "ratings_rels_parent_idx" ON "ratings_rels" USING btree ("parent_id");
      CREATE INDEX IF NOT EXISTS "ratings_rels_path_idx" ON "ratings_rels" USING btree ("path");
    `);

    await prePool.end();
  } catch (preErr: any) {
    console.error('Pre-init migration (ratings) failed:', preErr.message);
  }

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

  // Auto-migrate: create users_rels table if it doesn't exist (needed for profilePicture upload field)
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URI });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "users_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL,
        "path" varchar NOT NULL,
        "media_id" integer
      );
      DO $$ BEGIN
        ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE INDEX IF NOT EXISTS "users_rels_order_idx" ON "users_rels" USING btree ("order");
      CREATE INDEX IF NOT EXISTS "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
      CREATE INDEX IF NOT EXISTS "users_rels_path_idx" ON "users_rels" USING btree ("path");
      CREATE INDEX IF NOT EXISTS "users_rels_media_id_idx" ON "users_rels" USING btree ("media_id");
    `);
    // Add void_requests_id column to transactions_rels if missing
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE "transactions_rels" ADD COLUMN "void_requests_id" integer;
      EXCEPTION WHEN duplicate_column THEN null;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "transactions_rels" ADD CONSTRAINT "transactions_rels_void_requests_fk" FOREIGN KEY ("void_requests_id") REFERENCES "public"."void_requests"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE INDEX IF NOT EXISTS "transactions_rels_void_requests_id_idx" ON "transactions_rels" USING btree ("void_requests_id");
    `);

    // Auto-migrate: create user_events table for analytics collection
    // Note: eventType is a select field — Payload v2 keeps camelCase for select/enum columns
    // First, fix any old table that used wrong column name "event_type" instead of "eventType"
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_events' AND column_name = 'event_type'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_events' AND column_name = 'eventType'
        ) THEN
          ALTER TABLE "user_events" RENAME COLUMN "event_type" TO "eventType";
          ALTER TABLE "user_events" ALTER COLUMN "eventType" TYPE varchar;
        END IF;
      END $$;
    `);

    // Create enum type for eventType select field
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_user_events_event_type" AS ENUM (
          'page_view', 'login', 'login_failed', 'logout', 'register',
          'search', 'product_view', 'conversation_opened', 'user_profile_viewed', 'media_uploaded',
          'bid_placed', 'product_created', 'product_updated', 'product_sold',
          'message_sent', 'transaction_status_changed', 'rating_created', 'rating_follow_up',
          'bid_accepted', 'void_request_created', 'void_request_responded',
          'seller_choice_made', 'second_bidder_responded', 'profile_updated', 'profile_picture_changed'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "eventType" "enum_user_events_event_type",
        "page" varchar,
        "metadata" jsonb,
        "session_id" varchar,
        "device_info" jsonb,
        "referrer" varchar,
        "ip" varchar,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "user_events_event_type_idx" ON "user_events" USING btree ("eventType");
      CREATE INDEX IF NOT EXISTS "user_events_session_id_idx" ON "user_events" USING btree ("session_id");
      CREATE INDEX IF NOT EXISTS "user_events_created_at_idx" ON "user_events" USING btree ("created_at");
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_events_rels" (
        "id" serial PRIMARY KEY NOT NULL,
        "order" integer,
        "parent_id" integer NOT NULL,
        "path" varchar NOT NULL,
        "users_id" integer
      );
    `);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE "user_events_rels" ADD CONSTRAINT "user_events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user_events"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      DO $$ BEGIN
        ALTER TABLE "user_events_rels" ADD CONSTRAINT "user_events_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      CREATE INDEX IF NOT EXISTS "user_events_rels_order_idx" ON "user_events_rels" USING btree ("order");
      CREATE INDEX IF NOT EXISTS "user_events_rels_parent_idx" ON "user_events_rels" USING btree ("parent_id");
      CREATE INDEX IF NOT EXISTS "user_events_rels_path_idx" ON "user_events_rels" USING btree ("path");
      CREATE INDEX IF NOT EXISTS "user_events_rels_users_id_idx" ON "user_events_rels" USING btree ("users_id");
    `);

    await pool.end();
    payload.logger.info('Database schema verified/migrated');
  } catch (migrationErr: any) {
    payload.logger.error('Failed to run startup migration: ' + migrationErr.message);
  }

  // Elasticsearch: ensure index exists on startup
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

  // Expose ES index/update functions globally so Payload hooks can call them
  (global as any).indexProduct = indexProduct;
  (global as any).updateProductIndex = updateProductIndex;

  // Root route - API info
  app.get('/', (req, res) => {
    res.json({
      message: 'Marketplace CMS API',
      status: 'running',
      admin: '/admin',
      endpoints: {
        products: '/api/products',
        users: '/api/users',
        bids: '/api/bids',
        messages: '/api/messages',
        transactions: '/api/transactions',
      },
    });
  });

  // Manual backup trigger (admin-only)
  app.post('/api/backup/trigger', async (req, res) => {
    try {
      const user = await authenticateJWT(req);
      if (!user || (user as any).role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      if (isBackupInProgress()) {
        return res.status(409).json({ error: 'Backup already in progress' });
      }

      res.json({ message: 'Backup started' });

      const result = await runBackup();
      if (result.success) {
        await cleanupOldBackups();
      }
    } catch (error: any) {
      console.error('[BACKUP] Manual trigger failed:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Backup trigger failed' });
      }
    }
  });

  // Create conversations for sold products
  app.post('/api/create-conversations', async (req, res) => {
    try {
      // Admin-only maintenance endpoint
      const user = await authenticateJWT(req);
      if (!user || (user as any).role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      console.log('Starting conversation creation for sold products...');

      // Find all sold products
      const soldProducts = await payload.find({
        collection: 'products',
        where: {
          status: {
            equals: 'sold',
          },
        },
        limit: 1000,
      });

      let conversationsCreated = 0;
      let skipped = 0;
      const results = [];

      for (const product of soldProducts.docs) {
        try {
          // Check if conversation already exists
          const existingMessages = await payload.find({
            collection: 'messages',
            where: {
              product: {
                equals: product.id,
              },
            },
            limit: 1,
          });

          const conversationExists = existingMessages.docs && existingMessages.docs.length > 0;

          // Find the highest bidder
          const bids = await payload.find({
            collection: 'bids',
            where: {
              product: {
                equals: product.id,
              },
            },
            sort: '-amount',
            limit: 1,
          });

          if (!bids.docs || bids.docs.length === 0) {
            results.push({ product: product.title, status: 'skipped', reason: 'no bids found' });
            skipped++;
            continue;
          }

          const highestBid: any = bids.docs[0];
          const bidderId = typeof highestBid.bidder === 'object' && highestBid.bidder ? highestBid.bidder.id : highestBid.bidder;
          const sellerId = typeof product.seller === 'object' && product.seller ? (product.seller as any).id : product.seller;

          let conversationCreated = false;
          let transactionCreated = false;

          // Create initial message from seller to buyer if it doesn't exist
          if (!conversationExists) {
            await payload.create({
              collection: 'messages',
              data: {
                product: Number(product.id),
                sender: sellerId,
                receiver: bidderId,
                message: `Congratulations! Your bid has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`,
                read: false,
              },
            });
            conversationCreated = true;
            conversationsCreated++;
          }

          // Check if transaction already exists
          const existingTransaction = await payload.find({
            collection: 'transactions',
            where: {
              product: {
                equals: product.id,
              },
            },
            limit: 1,
          });

          // Create transaction if it doesn't exist
          if (!existingTransaction.docs || existingTransaction.docs.length === 0) {
            await payload.create({
              collection: 'transactions',
              data: {
                product: Number(product.id),
                seller: sellerId,
                buyer: bidderId,
                amount: highestBid.amount,
                status: 'pending',
                notes: `Transaction created for "${product.title}" with winning bid of ${highestBid.amount}`,
              },
            });
            transactionCreated = true;
          }

          // Build status message
          if (conversationCreated && transactionCreated) {
            results.push({ product: product.title, status: 'created conversation and transaction' });
          } else if (conversationCreated && !transactionCreated) {
            results.push({ product: product.title, status: 'created conversation (transaction exists)' });
          } else if (!conversationCreated && transactionCreated) {
            results.push({ product: product.title, status: 'created transaction (conversation exists)' });
          } else {
            results.push({ product: product.title, status: 'skipped (both exist)' });
            skipped++;
          }
        } catch (error: any) {
          results.push({ product: product.title, status: 'error', error: error.message });
        }
      }

      res.json({
        success: true,
        summary: {
          totalSoldProducts: soldProducts.docs.length,
          conversationsCreated,
          skipped,
        },
        results,
      });
    } catch (error: any) {
      console.error('Error creating conversations:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Endpoint to get product update status (lightweight check for changes)
  app.get('/api/products/:id/status', async (req, res) => {
    try {
      const productId = req.params.id;

      // Fetch product with minimal fields
      const product = await payload.findByID({
        collection: 'products',
        id: productId,
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Block hidden product status for non-admins (unless they're the seller)
      if (!product.active) {
        const user = await authenticateJWT(req);
        const sellerId = typeof product.seller === 'object' ? (product.seller as any).id : product.seller;
        if (!user || ((user as any).role !== 'admin' && (user as any).id !== sellerId)) {
          return res.status(404).json({ error: 'Product not found' });
        }
      }

      // Get the latest bid timestamp
      const latestBid = await payload.find({
        collection: 'bids',
        where: {
          product: {
            equals: productId,
          },
        },
        sort: '-bidTime',
        limit: 1,
      });

      const latestBidTime = latestBid.docs.length > 0 ? latestBid.docs[0].bidTime : null;

      // Return minimal data for comparison
      res.json({
        id: product.id,
        updatedAt: product.updatedAt,
        status: product.status,
        currentBid: product.currentBid,
        latestBidTime,
        bidCount: latestBid.totalDocs,
      });
    } catch (error: any) {
      console.error('Error fetching product status:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Legacy in-process SSE endpoint removed — real-time updates handled by sse-service via Redis pub/sub
  // Hooks that call (global as any).broadcastProductUpdate will get undefined and skip via if (broadcast) guard

  // Expose Redis message notification globally for hooks (avoid webpack bundling issues)
  (global as any).publishMessageNotification = publishMessageNotification;

  // Expose global event publisher for hooks (new products, etc.)
  (global as any).publishGlobalEvent = publishGlobalEvent;

  // Expose product update publisher for hooks (visibility changes, etc.)
  (global as any).publishProductUpdate = publishProductUpdate;

  // Expose analytics event tracker for hooks (avoids webpack bundling issues)
  (global as any).trackEvent = (eventType: string, userId?: number | string, metadata?: Record<string, any>) => {
    setImmediate(async () => {
      try {
        await payload.create({
          collection: 'user-events',
          data: {
            eventType,
            user: userId || undefined,
            metadata: metadata || undefined,
          },
          overrideAccess: true,
        });
      } catch (err) {
        // Silently swallow — analytics should never break anything
      }
    });
  };

  // Sync endpoint to update product currentBid with highest bid (admin only)
  app.post('/api/sync-bids', async (req, res) => {
    try {
      const user = await authenticateJWT(req);
      if (!user || (user as any).role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      // Fetch all bids
      const bids = await payload.find({
        collection: 'bids',
        limit: 1000,
        sort: '-amount',
      });

      // Group bids by product and find highest bid for each
      const productBids: { [key: string]: number } = {};

      for (const bid of bids.docs) {
        const productId = typeof bid.product === 'string' ? bid.product : (bid.product as any).id;
        const amount = bid.amount as number;

        if (!productBids[productId] || amount > productBids[productId]) {
          productBids[productId] = amount;
        }
      }

      // Update each product with its highest bid
      const updates = [];
      for (const [productId, highestBid] of Object.entries(productBids)) {
        try {
          await payload.update({
            collection: 'products',
            id: productId,
            data: {
              currentBid: highestBid,
            },
          });
          updates.push({ productId, highestBid });
        } catch (error: any) {
          console.error(`Error updating product ${productId}:`, error.message);
        }
      }

      res.json({
        success: true,
        message: `Updated ${updates.length} products`,
        updates,
      });
    } catch (error: any) {
      console.error('Error syncing bids:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Queue bid endpoint - queues bid to Redis for processing by bid worker
  // This prevents race conditions by processing bids sequentially
  app.post('/api/bid/queue', bidLimiter, requireAuth, validate(bidQueueSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { productId, amount, censorName } = req.body;

      // Basic validation - get product to check status
      const product: any = await payload.findByID({
        collection: 'products',
        id: productId,
        depth: 0, // Skip relationship hydration — only need scalar fields for validation
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (product.status !== 'available') {
        return res.status(400).json({ error: `Product is ${product.status}` });
      }

      if (!product.active) {
        return res.status(400).json({ error: 'Product is not active' });
      }

      // Check auction end date (with 2-second buffer to account for queue processing delay)
      const auctionEnd = new Date(product.auctionEndDate).getTime();
      const now = Date.now();
      if (auctionEnd <= now) {
        return res.status(400).json({ error: 'Auction has ended' });
      }
      if (auctionEnd - now < 2000) {
        return res.status(400).json({ error: 'Auction is ending, bid cannot be processed in time' });
      }

      // Validate bid amount
      const currentBid = product.currentBid || 0;
      const minimumBid = currentBid > 0
        ? currentBid + (product.bidInterval || 1)
        : product.startingPrice;

      if (amount < minimumBid) {
        return res.status(400).json({
          error: `Bid must be at least ${minimumBid}`,
          minimumBid,
          currentBid,
        });
      }

      // Check seller is not bidding on their own product
      const sellerId = typeof product.seller === 'object' ? product.seller.id : product.seller;
      if (sellerId === userId) {
        return res.status(400).json({ error: 'You cannot bid on your own product' });
      }

      // Queue the bid
      const result = await queueBid(
        parseInt(productId, 10),
        userId,
        amount,
        censorName || false
      );

      if (!result.success) {
        // If Redis is down, fall back to direct bid creation with row-level locking
        // Uses raw SQL with FOR UPDATE to prevent race conditions (mirrors bid-worker)
        console.warn('[CMS] Redis queue failed, falling back to direct bid creation');

        const pool = (payload.db as any).pool;
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          // Lock the product row — prevents concurrent bids from both passing validation
          const lockedResult = await client.query(
            `SELECT id, current_bid, starting_price, bid_interval, status, active, auction_end_date
             FROM products WHERE id = $1 FOR UPDATE`,
            [parseInt(productId, 10)]
          );

          if (lockedResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
          }

          const locked = lockedResult.rows[0];

          if (locked.status !== 'available') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Product is ${locked.status}` });
          }

          if (!locked.active) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Product is not active' });
          }

          if (new Date(locked.auction_end_date) <= new Date()) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Auction has ended' });
          }

          // Re-validate minimum bid against locked row data
          const lockedCurrentBid = Number(locked.current_bid) || 0;
          const lockedBidInterval = Number(locked.bid_interval) || 1;
          const lockedStartingPrice = Number(locked.starting_price) || 0;
          const lockedMinimumBid = lockedCurrentBid > 0
            ? lockedCurrentBid + lockedBidInterval
            : lockedStartingPrice;

          if (amount < lockedMinimumBid) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Bid must be at least ${lockedMinimumBid}` });
          }

          // Shill-bidding check under lock
          const sellerCheck = await client.query(
            `SELECT users_id FROM products_rels WHERE parent_id = $1 AND path = 'seller'`,
            [parseInt(productId, 10)]
          );
          if (sellerCheck.rows.length > 0 && sellerCheck.rows[0].users_id === userId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'You cannot bid on your own product' });
          }

          // Create bid (Payload v2 schema — relationships in separate table)
          const bidResult = await client.query(
            `INSERT INTO bids (amount, bid_time, censor_name, created_at, updated_at)
             VALUES ($1, NOW(), $2, NOW(), NOW()) RETURNING id`,
            [amount, censorName || false]
          );
          const bidId = bidResult.rows[0].id;

          await client.query(
            `INSERT INTO bids_rels (parent_id, path, products_id) VALUES ($1, 'product', $2)`,
            [bidId, parseInt(productId, 10)]
          );
          await client.query(
            `INSERT INTO bids_rels (parent_id, path, users_id) VALUES ($1, 'bidder', $2)`,
            [bidId, userId]
          );

          // Update product current bid
          await client.query(
            `UPDATE products SET current_bid = $1, updated_at = NOW() WHERE id = $2`,
            [amount, parseInt(productId, 10)]
          );

          // Get bidder name for SSE event
          const bidderResult = await client.query(
            `SELECT name FROM users WHERE id = $1`,
            [userId]
          );

          await client.query('COMMIT');

          const bidTime = new Date().toISOString();
          const bidderName = bidderResult.rows[0]?.name || 'Anonymous';

          // Publish update via Redis if possible (with full bid data)
          publishProductUpdate(parseInt(productId, 10), {
            type: 'bid',
            success: true,
            bidId,
            amount,
            bidderId: userId,
            bidderName,
            censorName: censorName || false,
            bidTime,
          });

          return res.json({
            success: true,
            bidId,
            fallback: true,
            message: 'Bid placed successfully (direct)',
          });
        } catch (error: any) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('[CMS] Fallback bid error:', error);
          return res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
        } finally {
          client.release();
        }
      }

      res.json({
        success: true,
        jobId: result.jobId,
        queued: true,
        message: 'Bid queued for processing',
      });
    } catch (error: any) {
      console.error('Error queuing bid:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Accept bid endpoint - queues accept action to Redis to prevent race conditions
  app.post('/api/bid/accept', bidLimiter, requireAuth, validate(bidAcceptSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { productId } = req.body;

      // Get product to verify ownership and get highest bid
      const product: any = await payload.findByID({
        collection: 'products',
        id: productId,
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Verify seller owns the product
      const sellerId = typeof product.seller === 'object' ? product.seller.id : product.seller;
      if (sellerId !== userId) {
        return res.status(403).json({ error: 'Only the seller can accept bids' });
      }

      if (product.status !== 'available') {
        return res.status(400).json({ error: `Product is already ${product.status}` });
      }

      // Get highest bid
      const bids = await payload.find({
        collection: 'bids',
        where: { product: { equals: productId } },
        sort: '-amount',
        limit: 1,
      });

      if (bids.docs.length === 0) {
        return res.status(400).json({ error: 'No bids to accept' });
      }

      const highestBid: any = bids.docs[0];
      const highestBidderId = typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder;

      // Queue the accept bid action
      const result = await queueAcceptBid(
        parseInt(productId, 10),
        userId,
        highestBidderId,
        highestBid.amount
      );

      if (!result.success) {
        // Fallback to direct update if Redis is down — use row-level locking
        // Uses raw SQL with FOR UPDATE to prevent double-acceptance (mirrors bid-worker)
        console.warn('[CMS] Redis queue failed, falling back to direct accept');

        const pool = (payload.db as any).pool;
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          // Lock the product row — prevents two concurrent accepts from both succeeding
          const freshResult = await client.query(
            `SELECT id, title, status FROM products WHERE id = $1 FOR UPDATE`,
            [parseInt(productId, 10)]
          );

          if (freshResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Product not found' });
          }

          const freshProduct = freshResult.rows[0];

          if (freshProduct.status !== 'available') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Product is already ${freshProduct.status}` });
          }

          // Update product status to sold
          await client.query(
            `UPDATE products SET status = 'sold', updated_at = NOW() WHERE id = $1`,
            [parseInt(productId, 10)]
          );

          // Create congratulatory message
          const congratsMessage = `Congratulations! Your bid has been accepted for "${freshProduct.title}". Let's discuss the next steps for completing this transaction.`;
          const messageResult = await client.query(
            `INSERT INTO messages (message, read, created_at, updated_at)
             VALUES ($1, false, NOW(), NOW()) RETURNING id`,
            [congratsMessage]
          );
          const messageId = messageResult.rows[0].id;

          await client.query(
            `INSERT INTO messages_rels (parent_id, path, products_id) VALUES ($1, 'product', $2)`,
            [messageId, parseInt(productId, 10)]
          );
          await client.query(
            `INSERT INTO messages_rels (parent_id, path, users_id) VALUES ($1, 'sender', $2)`,
            [messageId, sellerId]
          );
          await client.query(
            `INSERT INTO messages_rels (parent_id, path, users_id) VALUES ($1, 'receiver', $2)`,
            [messageId, highestBidderId]
          );

          // Create transaction record
          const txNotes = `Transaction created for "${freshProduct.title}" with winning bid of ${highestBid.amount}`;
          const txResult = await client.query(
            `INSERT INTO transactions (amount, status, notes, created_at, updated_at)
             VALUES ($1, 'pending', $2, NOW(), NOW()) RETURNING id`,
            [highestBid.amount, txNotes]
          );
          const transactionId = txResult.rows[0].id;

          await client.query(
            `INSERT INTO transactions_rels (parent_id, path, products_id) VALUES ($1, 'product', $2)`,
            [transactionId, parseInt(productId, 10)]
          );
          await client.query(
            `INSERT INTO transactions_rels (parent_id, path, users_id) VALUES ($1, 'seller', $2)`,
            [transactionId, sellerId]
          );
          await client.query(
            `INSERT INTO transactions_rels (parent_id, path, users_id) VALUES ($1, 'buyer', $2)`,
            [transactionId, highestBidderId]
          );

          await client.query('COMMIT');

          publishProductUpdate(parseInt(productId, 10), {
            type: 'accepted',
            status: 'sold',
            winnerId: highestBidderId,
            amount: highestBid.amount,
          });

          const trackEvent = (global as any).trackEvent;
          if (trackEvent) trackEvent('bid_accepted', sellerId, { productId, bidderId: highestBidderId, amount: highestBid.amount });

          return res.json({
            success: true,
            fallback: true,
            message: 'Bid accepted successfully (direct)',
          });
        } catch (error: any) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('[CMS] Fallback accept error:', error);
          return res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
        } finally {
          client.release();
        }
      }

      const trackEvent = (global as any).trackEvent;
      if (trackEvent) trackEvent('bid_accepted', userId, { productId, bidderId: highestBidderId, amount: highestBid.amount });

      res.json({
        success: true,
        jobId: result.jobId,
        queued: true,
        message: 'Accept bid queued for processing',
      });
    } catch (error: any) {
      console.error('Error accepting bid:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Health check endpoint for Redis status
  app.get('/api/health', async (req, res) => {
    const esAvailable = await isElasticAvailable();
    res.json({
      status: 'ok',
      redis: isRedisConnected() ? 'connected' : 'disconnected',
      elasticsearch: esAvailable ? 'connected' : 'disconnected',
      timestamp: Date.now(),
    });
  });

  // Elasticsearch: search products (path avoids Payload's /api/products/:id route)
  app.get('/api/search/products', async (req, res) => {
    try {
      const query = req.query.q as string || '';
      let status = req.query.status as string || 'available';
      const region = req.query.region as string || '';
      const city = req.query.city as string || '';
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '12', 10);

      // Only admins can search hidden products
      if (status === 'hidden') {
        const user = await authenticateJWT(req);
        if (!user || (user as any).role !== 'admin') {
          status = 'available'; // Silently fall back to available
        }
      }

      const esAvailable = await isElasticAvailable();

      if (!esAvailable || !query.trim()) {
        // Fall back to Payload's built-in search
        return res.status(200).json({ fallback: true });
      }

      // Determine active filter based on status
      let esStatus: string | undefined;
      let esActive: boolean | undefined;
      if (status === 'hidden') {
        esActive = false;
      } else if (status === 'active') {
        esStatus = 'available';
        esActive = true;
      } else if (status === 'ended') {
        esStatus = 'ended';
      }

      const esResult = await searchProducts({
        query,
        status: esStatus,
        active: esActive,
        region: region || undefined,
        city: city || undefined,
        page,
        limit,
      });

      if (esResult.ids.length === 0) {
        return res.json({
          docs: [],
          totalDocs: esResult.total,
          totalPages: Math.ceil(esResult.total / limit),
          page,
          limit,
        });
      }

      // Fetch full product docs from Payload by IDs (preserving ES sort order)
      const products = await payload.find({
        collection: 'products',
        where: { id: { in: esResult.ids.map(String) } },
        limit: esResult.ids.length,
        depth: 1,
      });

      // Preserve ES relevance ordering
      const productMap = new Map(products.docs.map((p: any) => [p.id, p]));
      const orderedDocs = esResult.ids
        .map(id => productMap.get(id))
        .filter(Boolean);

      res.json({
        docs: orderedDocs,
        totalDocs: esResult.total,
        totalPages: Math.ceil(esResult.total / limit),
        page,
        limit,
      });
    } catch (error: any) {
      console.error('Elasticsearch search error:', error);
      res.status(200).json({ fallback: true });
    }
  });

  // Elasticsearch: bulk sync all products (admin utility)
  app.post('/api/elasticsearch/sync', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await payload.findByID({ collection: 'users', id: userId });
      if ((user as any).role !== 'admin') return res.status(403).json({ error: 'Admin only' });

      const esAvailable = await isElasticAvailable();
      if (!esAvailable) return res.status(503).json({ error: 'Elasticsearch not available' });

      await ensureProductIndex();
      const result = await bulkSyncProducts(payload);

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Elasticsearch sync error:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // ============================================
  // Void Request API Endpoints
  // ============================================

  // Create void request
  app.post('/api/void-request/create', requireAuth, validate(voidRequestCreateSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { transactionId, reason } = req.body;

      // Get transaction with relationships
      const transaction: any = await payload.findByID({
        collection: 'transactions',
        id: transactionId,
        depth: 1,
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const buyerId = typeof transaction.buyer === 'object' ? transaction.buyer.id : transaction.buyer;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;
      const productId = typeof transaction.product === 'object' ? transaction.product.id : transaction.product;

      // Verify user is buyer or seller
      if (userId !== buyerId && userId !== sellerId) {
        return res.status(403).json({ error: 'Only buyer or seller can create void request' });
      }

      // Check if transaction can be voided (must be pending or in_progress)
      if (!['pending', 'in_progress'].includes(transaction.status)) {
        return res.status(400).json({ error: `Cannot void transaction with status: ${transaction.status}` });
      }

      // Cooldown: reject void requests on transactions created less than 1 hour ago
      const transactionCreatedAt = new Date(transaction.createdAt).getTime();
      const oneHourMs = 60 * 60 * 1000;
      if (Date.now() - transactionCreatedAt < oneHourMs) {
        return res.status(400).json({
          error: 'Void requests can only be submitted at least 1 hour after the transaction was created',
        });
      }

      // Check if there's already a pending void request
      const existingRequests = await payload.find({
        collection: 'void-requests',
        where: {
          transaction: { equals: transactionId },
          status: { equals: 'pending' },
        },
        limit: 1,
      });

      if (existingRequests.docs.length > 0) {
        return res.status(400).json({ error: 'There is already a pending void request for this transaction' });
      }

      // Rate limit: prevent spam by checking total void requests from this user in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentUserRequests = await payload.find({
        collection: 'void-requests',
        where: {
          initiator: { equals: userId },
          createdAt: { greater_than: oneDayAgo },
        },
        limit: 0,
      });

      if (recentUserRequests.totalDocs >= 5) {
        return res.status(429).json({ error: 'Too many void requests. Please try again later.' });
      }

      const initiatorRole = userId === sellerId ? 'seller' : 'buyer';

      // Create void request
      const voidRequest = await payload.create({
        collection: 'void-requests',
        data: {
          transaction: transactionId,
          product: productId,
          initiator: userId,
          initiatorRole,
          reason,
          status: 'pending',
        },
      });

      // Get user details for notification
      const initiator: any = await payload.findByID({ collection: 'users', id: userId });
      const product: any = await payload.findByID({ collection: 'products', id: productId });
      const otherPartyId = userId === sellerId ? buyerId : sellerId;
      const otherParty: any = await payload.findByID({ collection: 'users', id: otherPartyId });

      // Send SSE notification to other party
      publishMessageNotification(otherPartyId, {
        type: 'void_request',
        messageId: voidRequest.id,
        productId,
        senderId: userId,
        preview: `Void request for ${product.title}`,
      });

      // Send email notification to other party
      if (otherParty?.email) {
        await sendVoidRequestEmail({
          to: otherParty.email,
          productTitle: product.title,
          initiatorName: initiator.name,
          reason,
          isInitiator: false,
          productId,
          voidRequestId: voidRequest.id as number,
        });
      }

      const trackEvent = (global as any).trackEvent;
      if (trackEvent) trackEvent('void_request_created', userId, { productId, transactionId, voidRequestId: voidRequest.id });

      res.json({
        success: true,
        voidRequestId: voidRequest.id,
        message: 'Void request created successfully',
      });
    } catch (error: any) {
      console.error('Error creating void request:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Respond to void request (approve/reject)
  app.post('/api/void-request/respond', requireAuth, validate(voidRequestRespondSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { voidRequestId, action, rejectionReason } = req.body;

      // Get void request with relationships
      const voidRequest: any = await payload.findByID({
        collection: 'void-requests',
        id: voidRequestId,
        depth: 2,
      });

      if (!voidRequest) {
        return res.status(404).json({ error: 'Void request not found' });
      }

      if (voidRequest.status !== 'pending') {
        return res.status(400).json({ error: `Void request is already ${voidRequest.status}` });
      }

      // Get transaction details
      const transaction = voidRequest.transaction;
      const buyerId = typeof transaction.buyer === 'object' ? transaction.buyer.id : transaction.buyer;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;
      const initiatorId = typeof voidRequest.initiator === 'object' ? voidRequest.initiator.id : voidRequest.initiator;

      // Verify user is the OTHER party (not the initiator)
      if (userId === initiatorId) {
        return res.status(403).json({ error: 'Cannot respond to your own void request' });
      }

      if (userId !== buyerId && userId !== sellerId) {
        return res.status(403).json({ error: 'Only buyer or seller can respond to void request' });
      }

      const productId = typeof voidRequest.product === 'object' ? voidRequest.product.id : voidRequest.product;
      const product: any = await payload.findByID({ collection: 'products', id: productId });
      const initiator: any = await payload.findByID({ collection: 'users', id: initiatorId });

      if (action === 'approve') {
        // Update void request status
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            status: 'approved',
            approvedAt: new Date().toISOString(),
          },
        });

        // Update transaction status to voided
        await payload.update({
          collection: 'transactions',
          id: transaction.id,
          data: {
            status: 'voided',
            voidRequest: voidRequestId,
          },
        });

        // Send notification to initiator
        publishMessageNotification(initiatorId, {
          type: 'void_approved',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `Void request approved for ${product.title}`,
        });

        // Send email to initiator
        if (initiator?.email) {
          await sendVoidResponseEmail({
            to: initiator.email,
            productTitle: product.title,
            approved: true,
            productId,
            voidRequestId,
          });
        }

        // If user responding is the buyer, notify seller to make choice
        // If user responding is the seller, they need to make the choice
        const isSeller = userId === sellerId;

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('void_request_responded', userId, { voidRequestId, action: 'approve', productId });

        res.json({
          success: true,
          message: 'Void request approved',
          requiresSellerChoice: true,
          isSeller,
          voidRequestId,
        });
      } else {
        // Reject the void request
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            status: 'rejected',
            rejectionReason: rejectionReason || 'No reason provided',
          },
        });

        // Send notification to initiator
        publishMessageNotification(initiatorId, {
          type: 'void_rejected',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `Void request rejected for ${product.title}`,
        });

        // Send email to initiator
        if (initiator?.email) {
          await sendVoidResponseEmail({
            to: initiator.email,
            productTitle: product.title,
            approved: false,
            rejectionReason,
            productId,
            voidRequestId,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('void_request_responded', userId, { voidRequestId, action: 'reject', productId });

        res.json({
          success: true,
          message: 'Void request rejected',
        });
      }
    } catch (error: any) {
      console.error('Error responding to void request:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Seller choice after void approval
  app.post('/api/void-request/seller-choice', requireAuth, validate(voidRequestSellerChoiceSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { voidRequestId, choice } = req.body;

      // Get void request
      const voidRequest: any = await payload.findByID({
        collection: 'void-requests',
        id: voidRequestId,
        depth: 2,
      });

      if (!voidRequest) {
        return res.status(404).json({ error: 'Void request not found' });
      }

      if (voidRequest.status !== 'approved') {
        return res.status(400).json({ error: 'Void request must be approved first' });
      }

      if (voidRequest.sellerChoice) {
        return res.status(400).json({ error: 'Seller choice already made' });
      }

      // Verify user is the seller
      const transaction = voidRequest.transaction;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;

      if (userId !== sellerId) {
        return res.status(403).json({ error: 'Only seller can make this choice' });
      }

      const productId = typeof voidRequest.product === 'object' ? voidRequest.product.id : voidRequest.product;
      const product: any = await payload.findByID({ collection: 'products', id: productId, depth: 1 });
      const seller: any = await payload.findByID({ collection: 'users', id: sellerId });

      if (choice === 'restart_bidding') {
        // Set new auction end date (24 hours from now)
        const newEndDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        // Update product status back to available
        await payload.update({
          collection: 'products',
          id: productId,
          data: {
            status: 'available',
            auctionEndDate: newEndDate,
          },
        });

        // Update void request with choice
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            sellerChoice: 'restart_bidding',
          },
        });

        // Get all bidders for this product
        const bids = await payload.find({
          collection: 'bids',
          where: { product: { equals: productId } },
          depth: 1,
        });

        // Notify all bidders
        const notifiedBidders = new Set<number>();
        for (const bid of bids.docs) {
          const bidderId = typeof (bid as any).bidder === 'object' ? (bid as any).bidder.id : (bid as any).bidder;
          if (notifiedBidders.has(bidderId)) continue;
          notifiedBidders.add(bidderId);

          const bidder: any = await payload.findByID({ collection: 'users', id: bidderId });

          // SSE notification
          publishMessageNotification(bidderId, {
            type: 'auction_restarted',
            messageId: voidRequestId,
            productId,
            senderId: sellerId,
            preview: `Bidding reopened for ${product.title}`,
          });

          // Email notification
          if (bidder?.email) {
            await sendAuctionRestartedEmail({
              to: bidder.email,
              productTitle: product.title,
              productId,
              newEndDate,
            });
          }
        }

        // Broadcast product update
        publishProductUpdate(productId, {
          type: 'status_change',
          status: 'available',
          auctionEndDate: newEndDate,
        });

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('seller_choice_made', userId, { voidRequestId, choice: 'restart_bidding', productId });

        res.json({
          success: true,
          message: 'Auction restarted successfully',
          newEndDate,
          notifiedBidders: notifiedBidders.size,
        });
      } else {
        // Offer to second highest bidder
        const bids = await payload.find({
          collection: 'bids',
          where: { product: { equals: productId } },
          sort: '-amount',
          limit: 2,
          depth: 1,
        });

        if (bids.docs.length < 2) {
          return res.status(400).json({
            error: 'No second bidder available. Please restart the bidding instead.',
            onlyOption: 'restart_bidding',
          });
        }

        const secondBid: any = bids.docs[1];
        const secondBidderId = typeof secondBid.bidder === 'object' ? secondBid.bidder.id : secondBid.bidder;
        const secondBidder: any = await payload.findByID({ collection: 'users', id: secondBidderId });

        // Update void request with offer details
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            sellerChoice: 'offer_second_bidder',
            secondBidderOffer: {
              offeredTo: secondBidderId,
              offerAmount: secondBid.amount,
              offerStatus: 'pending',
              offeredAt: new Date().toISOString(),
            },
          },
        });

        // SSE notification to second bidder
        publishMessageNotification(secondBidderId, {
          type: 'second_bidder_offer',
          messageId: voidRequestId,
          productId,
          senderId: sellerId,
          preview: `Offer to purchase ${product.title}`,
        });

        // Email to second bidder
        if (secondBidder?.email) {
          await sendSecondBidderOfferEmail({
            to: secondBidder.email,
            productTitle: product.title,
            offerAmount: secondBid.amount,
            currency: seller?.currency || 'PHP',
            productId,
            voidRequestId,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('seller_choice_made', userId, { voidRequestId, choice: 'offer_second_bidder', productId });

        res.json({
          success: true,
          message: 'Offer sent to second highest bidder',
          secondBidder: {
            id: secondBidderId,
            name: secondBidder?.name,
            amount: secondBid.amount,
          },
        });
      }
    } catch (error: any) {
      console.error('Error processing seller choice:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Second bidder response to offer
  app.post('/api/void-request/second-bidder-response', requireAuth, validate(voidRequestSecondBidderSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { voidRequestId, action } = req.body;

      // Get void request
      const voidRequest: any = await payload.findByID({
        collection: 'void-requests',
        id: voidRequestId,
        depth: 2,
      });

      if (!voidRequest) {
        return res.status(404).json({ error: 'Void request not found' });
      }

      if (voidRequest.sellerChoice !== 'offer_second_bidder') {
        return res.status(400).json({ error: 'No offer available for this void request' });
      }

      if (!voidRequest.secondBidderOffer || voidRequest.secondBidderOffer.offerStatus !== 'pending') {
        return res.status(400).json({ error: 'Offer is not pending' });
      }

      const offeredToId = typeof voidRequest.secondBidderOffer.offeredTo === 'object'
        ? voidRequest.secondBidderOffer.offeredTo.id
        : voidRequest.secondBidderOffer.offeredTo;

      if (userId !== offeredToId) {
        return res.status(403).json({ error: 'Only the offered bidder can respond' });
      }

      const transaction = voidRequest.transaction;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;
      const productId = typeof voidRequest.product === 'object' ? voidRequest.product.id : voidRequest.product;
      const product: any = await payload.findByID({ collection: 'products', id: productId });
      const seller: any = await payload.findByID({ collection: 'users', id: sellerId });
      const buyer: any = await payload.findByID({ collection: 'users', id: userId });

      if (action === 'accept') {
        // Atomically lock the product row and set to sold — prevents concurrent accepts
        // from both succeeding (two users hitting "accept" simultaneously, or network retries)
        const pool = (payload.db as any).pool;
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const lockedProduct = await client.query(
            `SELECT id, status FROM products WHERE id = $1 FOR UPDATE`,
            [parseInt(productId, 10)]
          );

          if (lockedProduct.rows.length === 0 || lockedProduct.rows[0].status === 'sold') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Product is no longer available' });
          }

          await client.query(
            `UPDATE products SET status = 'sold', updated_at = NOW() WHERE id = $1`,
            [parseInt(productId, 10)]
          );

          await client.query('COMMIT');
        } catch (lockError: any) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('Error locking product for second bidder accept:', lockError);
          return res.status(500).json({ error: isProduction ? 'Internal server error' : lockError.message });
        } finally {
          client.release();
        }

        // Product atomically sold — safe to use Payload ORM for remaining records
        // (concurrent request will see status = 'sold' and bail at the lock above)

        // Update offer status
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            secondBidderOffer: {
              ...voidRequest.secondBidderOffer,
              offerStatus: 'accepted',
              respondedAt: new Date().toISOString(),
            },
          },
        });

        // Create new transaction (product already set to sold above via row lock)
        const newTransaction = await payload.create({
          collection: 'transactions',
          data: {
            product: productId,
            seller: sellerId,
            buyer: userId,
            amount: voidRequest.secondBidderOffer.offerAmount,
            status: 'pending',
            notes: `Transaction created after void - offer to 2nd bidder accepted`,
          },
        });

        // Create congratulations message
        const congratsMessage = `Congratulations! Your offer has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`;
        await payload.create({
          collection: 'messages',
          data: {
            product: productId,
            sender: sellerId,
            receiver: userId,
            message: congratsMessage,
            read: false,
          },
        });

        // Notify seller
        publishMessageNotification(sellerId, {
          type: 'second_bidder_accepted',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `${buyer.name} accepted the offer for ${product.title}`,
        });

        // Send emails
        if (buyer?.email) {
          const escH = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          await queueEmail({
            to: buyer.email,
            subject: `Congratulations! You've secured "${product.title}"`,
            html: `
              <h2>Congratulations!</h2>
              <p>Your offer for <strong>${escH(product.title)}</strong> has been accepted.</p>
              <p>Amount: ${escH(String(voidRequest.secondBidderOffer.offerAmount))}</p>
              <p>Please check your inbox to coordinate with the seller.</p>
            `,
          });
        }

        if (seller?.email) {
          const escH = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          await queueEmail({
            to: seller.email,
            subject: `Offer accepted for "${product.title}"`,
            html: `
              <h2>Offer Accepted!</h2>
              <p><strong>${escH(buyer.name)}</strong> has accepted your offer for <strong>${escH(product.title)}</strong>.</p>
              <p>Amount: ${escH(String(voidRequest.secondBidderOffer.offerAmount))}</p>
              <p>Please check your inbox to coordinate the transaction.</p>
            `,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('second_bidder_responded', userId, { voidRequestId, action: 'accept', productId });

        res.json({
          success: true,
          message: 'Offer accepted successfully',
          transactionId: newTransaction.id,
        });
      } else {
        // Decline the offer
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            secondBidderOffer: {
              ...voidRequest.secondBidderOffer,
              offerStatus: 'declined',
              respondedAt: new Date().toISOString(),
            },
          },
        });

        // Notify seller
        publishMessageNotification(sellerId, {
          type: 'second_bidder_declined',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `${buyer.name} declined the offer for ${product.title}`,
        });

        // Email seller
        if (seller?.email) {
          const escH = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          await queueEmail({
            to: seller.email,
            subject: `Offer declined for "${product.title}"`,
            html: `
              <h2>Offer Declined</h2>
              <p><strong>${escH(buyer.name)}</strong> has declined your offer for <strong>${escH(product.title)}</strong>.</p>
              <p>You may want to restart the bidding to find another buyer.</p>
            `,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('second_bidder_responded', userId, { voidRequestId, action: 'decline', productId });

        res.json({
          success: true,
          message: 'Offer declined',
          suggestRestartBidding: true,
        });
      }
    } catch (error: any) {
      console.error('Error processing second bidder response:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Get void request for a transaction
  app.get('/api/void-request/:transactionId', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;

      const { transactionId } = req.params;

      // Verify user is a party to this transaction
      const transaction: any = await payload.findByID({
        collection: 'transactions',
        id: parseInt(transactionId, 10),
        depth: 1,
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const buyerId = typeof transaction.buyer === 'object' ? transaction.buyer.id : transaction.buyer;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;

      if (userId !== buyerId && userId !== sellerId) {
        return res.status(403).json({ error: 'You are not authorized to view this void request' });
      }

      const voidRequests = await payload.find({
        collection: 'void-requests',
        where: { transaction: { equals: parseInt(transactionId, 10) } },
        sort: '-createdAt',
        depth: 2,
      });

      res.json({
        success: true,
        voidRequests: voidRequests.docs,
      });
    } catch (error: any) {
      console.error('Error fetching void request:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // In-memory typing status store
  // Structure: { 'productId:userId': timestamp }
  const typingStatus = new Map<string, number>();
  const TYPING_TIMEOUT = 3000; // 3 seconds

  // Set typing status
  app.post('/api/typing', requireAuth, validate(typingSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { product, isTyping } = req.body;

      const key = `${product}:${userId}`;
      const productId = typeof product === 'string' ? parseInt(product, 10) : product;

      if (isTyping) {
        // Set typing with current timestamp
        typingStatus.set(key, Date.now());
      } else {
        // Remove typing status
        typingStatus.delete(key);
      }

      // Publish typing status via SSE for real-time updates
      await publishTypingStatus(productId, userId, isTyping);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error setting typing status:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Get typing status for a product
  app.get('/api/typing/:productId', requireAuth, async (req, res) => {
    try {
      const { productId } = req.params;
      const currentUserId = (req as any).userId;

      const now = Date.now();
      const typingUsers: string[] = [];

      // Clean up expired typing statuses and find active ones
      for (const [key, timestamp] of typingStatus.entries()) {
        if (now - timestamp > TYPING_TIMEOUT) {
          // Expired, remove it
          typingStatus.delete(key);
        } else if (key.startsWith(`${productId}:`)) {
          const userId = key.split(':')[1];
          // Don't include current user's typing status
          if (userId !== currentUserId) {
            typingUsers.push(userId);
          }
        }
      }

      res.json({ typing: typingUsers.length > 0, users: typingUsers });
    } catch (error: any) {
      console.error('Error getting typing status:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

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
