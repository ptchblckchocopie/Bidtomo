import express from 'express';
import payload from 'payload';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { queueBid, queueAcceptBid, publishProductUpdate, publishMessageNotification, publishTypingStatus, publishGlobalEvent, isRedisConnected } from './redis';
import { queueEmail, sendVoidRequestEmail, sendVoidResponseEmail, sendAuctionRestartedEmail, sendSecondBidderOfferEmail } from './services/emailService';
import { ensureProductIndex, indexProduct, updateProductIndex, searchProducts, bulkSyncProducts, isElasticAvailable } from './services/elasticSearch';
import { authenticateJWT } from './auth-helpers';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Railway/reverse proxy) — required for express-rate-limit
const PORT = parseInt(process.env.PORT || '3001', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Payload v2 hashes the secret before signing JWTs:
//   crypto.createHash('sha256').update(secret).digest('hex').slice(0, 32)
// We must use the same hashed secret when verifying tokens outside Payload middleware.
const payloadJwtSecret = crypto.createHash('sha256').update(process.env.PAYLOAD_SECRET!).digest('hex').slice(0, 32);

// Extract user ID from Express request via Payload's req.user or JWT header fallback
function authenticateFromRequest(req: express.Request): string | number | null {
  let userId: string | number | null = (req as any).user?.id || null;
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
      const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, payloadJwtSecret) as any;
        if (decoded.id) userId = decoded.id;
      } catch (err: any) {
        console.error(`[Auth] JWT verify failed for ${req.method} ${req.path}:`, err.message);
      }
    } else {
      console.warn(`[Auth] No Authorization header for ${req.method} ${req.path}`);
    }
  }
  return userId;
}

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
      const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;

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

  app.get('/api/users/limits', async (req, res) => {
    try {
      const currentUserId = authenticateFromRequest(req);

      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
                or: [
                  { status: { equals: 'active' } },
                  { status: { equals: 'available' } },
                ],
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
              or: [
                { status: { equals: 'active' } },
                { status: { equals: 'available' } },
              ],
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

  app.post('/api/users/profile-picture', async (req, res) => {
    try {
      const currentUserId = authenticateFromRequest(req);

      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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

      // The request body contains the new media ID (uploaded via /api/media first)
      const { mediaId } = req.body;

      if (!mediaId) {
        return res.status(400).json({ error: 'mediaId is required' });
      }

      // Update user with new profile picture
      const updatedUser = await payload.update({
        collection: 'users',
        id: currentUserId as string,
        data: {
          profilePicture: mediaId,
        },
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

      res.json({
        success: true,
        user: updatedUser,
      });
    } catch (error: any) {
      console.error('Error updating profile picture:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  app.delete('/api/users/profile-picture', async (req, res) => {
    try {
      const currentUserId = authenticateFromRequest(req);

      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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

  await payload.init({
    secret: process.env.PAYLOAD_SECRET!,
    express: app,
    config,
    onInit: async () => {
      payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`);
    },
  });

  payloadReady = true;

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
  app.post('/api/bid/queue', bidLimiter, async (req, res) => {
    try {
      // Authenticate via JWT token
      let userId: number | null = null;

      // Check if already authenticated via Payload middleware
      if ((req as any).user?.id) {
        userId = (req as any).user.id;
      } else {
        // Check for JWT in Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) {
              userId = decoded.id;
            }
          } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { productId, amount, censorName } = req.body;

      if (!productId) {
        return res.status(400).json({ error: 'Missing productId' });
      }

      // Strict bid amount validation — reject negative, zero, NaN, non-number
      if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Bid amount must be a positive number' });
      }

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
        // If Redis is down, fall back to direct bid creation with full validation
        console.warn('[CMS] Redis queue failed, falling back to direct bid creation');

        // Validate bid amount is a valid positive number
        if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
          return res.status(400).json({ error: 'Invalid bid amount' });
        }

        // Check auction end date
        if (product.auctionEndDate && new Date(product.auctionEndDate) <= new Date()) {
          return res.status(400).json({ error: 'Auction has ended' });
        }

        // Validate minimum bid
        const currentBid = Number(product.currentBid) || 0;
        const bidInterval = Number(product.bidInterval) || 1;
        const startingPrice = Number(product.startingPrice) || 0;
        const minimumBid = currentBid > 0 ? currentBid + bidInterval : startingPrice;

        if (amount < minimumBid) {
          return res.status(400).json({ error: `Bid must be at least ${minimumBid}` });
        }

        const bidTime = new Date().toISOString();
        const bid = await payload.create({
          collection: 'bids',
          data: {
            product: parseInt(productId, 10),
            bidder: userId,
            amount,
            censorName: censorName || false,
            bidTime,
          },
        });

        // Update product current bid
        await payload.update({
          collection: 'products',
          id: productId,
          data: { currentBid: amount },
        });

        // Get bidder name for SSE event
        const bidder = await payload.findByID({
          collection: 'users',
          id: userId,
        });

        // Publish update via Redis if possible (with full bid data)
        publishProductUpdate(parseInt(productId, 10), {
          type: 'bid',
          success: true,
          bidId: bid.id,
          amount,
          bidderId: userId,
          bidderName: bidder?.name || 'Anonymous',
          censorName: censorName || false,
          bidTime,
        });

        return res.json({
          success: true,
          bidId: bid.id,
          fallback: true,
          message: 'Bid placed successfully (direct)',
        });
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
  app.post('/api/bid/accept', bidLimiter, async (req, res) => {
    try {
      // Authenticate via JWT token
      let userId: number | null = null;

      if ((req as any).user?.id) {
        userId = (req as any).user.id;
      } else {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) {
              userId = decoded.id;
            }
          } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { productId } = req.body;

      if (!productId) {
        return res.status(400).json({ error: 'Missing productId' });
      }

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
        // Fallback to direct update if Redis is down
        console.warn('[CMS] Redis queue failed, falling back to direct accept');

        // Re-fetch product to check status atomically (prevent double-acceptance race condition)
        const freshProduct = await payload.findByID({
          collection: 'products',
          id: productId,
        });

        if (freshProduct.status !== 'available') {
          return res.status(400).json({ error: `Product is already ${freshProduct.status}` });
        }

        await payload.update({
          collection: 'products',
          id: productId,
          data: { status: 'sold' },
        });

        // Create congratulatory message from seller to buyer
        await payload.create({
          collection: 'messages',
          data: {
            product: Number(productId),
            sender: sellerId,
            receiver: highestBidderId,
            message: `Congratulations! Your bid has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`,
            read: false,
          },
        });

        // Create transaction record
        await payload.create({
          collection: 'transactions',
          data: {
            product: Number(productId),
            seller: sellerId,
            buyer: highestBidderId,
            amount: highestBid.amount,
            status: 'pending',
            notes: `Transaction created for "${product.title}" with winning bid of ${highestBid.amount}`,
          },
        });

        publishProductUpdate(parseInt(productId, 10), {
          type: 'accepted',
          status: 'sold',
          winnerId: highestBidderId,
          amount: highestBid.amount,
        });

        return res.json({
          success: true,
          fallback: true,
          message: 'Bid accepted successfully (direct)',
        });
      }

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
  app.post('/api/elasticsearch/sync', async (req, res) => {
    try {
      // Auth check — try Payload middleware first, then JWT fallback
      let userId: number | string | null = (req as any).user?.id || null;

      if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
          if (token) {
            try {
              const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET || '') as any;
              userId = decoded.id;
            } catch (jwtError) {
              // Token invalid/expired
            }
          }
        }
      }
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

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
  app.post('/api/void-request/create', async (req, res) => {
    try {
      // Authenticate user - check for existing auth first, then JWT
      let userId: number | null = null;
      if ((req as any).user?.id) {
        userId = (req as any).user.id;
      } else {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) userId = decoded.id;
          } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { transactionId, reason } = req.body;

      if (!transactionId || !reason) {
        return res.status(400).json({ error: 'Missing transactionId or reason' });
      }

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
  app.post('/api/void-request/respond', async (req, res) => {
    try {
      // Authenticate user - check for existing auth first, then JWT
      let userId: number | null = null;
      if ((req as any).user?.id) {
        userId = (req as any).user.id;
      } else {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) userId = decoded.id;
          } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { voidRequestId, action, rejectionReason } = req.body;

      if (!voidRequestId || !action) {
        return res.status(400).json({ error: 'Missing voidRequestId or action' });
      }

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be approve or reject' });
      }

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
  app.post('/api/void-request/seller-choice', async (req, res) => {
    try {
      // Authenticate user - check for existing auth first, then JWT
      let userId: number | null = null;
      if ((req as any).user?.id) {
        userId = (req as any).user.id;
      } else {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) userId = decoded.id;
          } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { voidRequestId, choice } = req.body;

      if (!voidRequestId || !choice) {
        return res.status(400).json({ error: 'Missing voidRequestId or choice' });
      }

      if (!['restart_bidding', 'offer_second_bidder'].includes(choice)) {
        return res.status(400).json({ error: 'Choice must be restart_bidding or offer_second_bidder' });
      }

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
  app.post('/api/void-request/second-bidder-response', async (req, res) => {
    try {
      // Authenticate user - check for existing auth first, then JWT
      let userId: number | null = null;
      if ((req as any).user?.id) {
        userId = (req as any).user.id;
      } else {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) userId = decoded.id;
          } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { voidRequestId, action } = req.body;

      if (!voidRequestId || !action) {
        return res.status(400).json({ error: 'Missing voidRequestId or action' });
      }

      if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ error: 'Action must be accept or decline' });
      }

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

        // Update product status to sold
        await payload.update({
          collection: 'products',
          id: productId,
          data: { status: 'sold' },
        });

        // Create new transaction
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
  app.get('/api/void-request/:transactionId', async (req, res) => {
    try {
      // Authenticate user - check for existing auth first, then JWT
      let userId: number | null = null;
      if ((req as any).user?.id) {
        userId = (req as any).user.id;
      } else {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) userId = decoded.id;
          } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
          }
        }
      }

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
  app.post('/api/typing', async (req, res) => {
    try {
      const { product, isTyping } = req.body;
      let userId: number | null = (req as any).user?.id || null;

      // JWT fallback for typing endpoint
      if (!userId) {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) userId = decoded.id;
          } catch (jwtError) {
            // Token invalid
          }
        }
      }

      if (!userId || !product) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

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
  app.get('/api/typing/:productId', async (req, res) => {
    try {
      const { productId } = req.params;
      const currentUserId = (req as any).user?.id;

      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

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
