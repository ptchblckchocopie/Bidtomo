import express from 'express';
import payload from 'payload';
import dotenv from 'dotenv';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { queueBid, queueAcceptBid, publishProductUpdate, publishMessageNotification, publishTypingStatus, publishGlobalEvent, isRedisConnected } from './redis';
import { queueEmail, sendVoidRequestEmail, sendVoidResponseEmail, sendAuctionRestartedEmail, sendSecondBidderOfferEmail } from './services/emailService';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Configure CORS to allow requests from the frontend (including production URLs)
const allowedOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:3000',
  'http://192.168.18.117:5173',
  'http://192.168.18.117:3001',
  'http://192.168.1.34:5173',
  'http://192.168.1.34:3001',
  'http://157.230.40.58',
  'http://157.230.40.58:3001',
  'http://157.230.40.58:3000',
  'https://bidmo.to',
  'https://www.bidmo.to',
  'https://app.bidmo.to',
  'http://bidmo.to',
  'http://www.bidmo.to',
  'http://app.bidmo.to',
  'https://cms-production-d0f7.up.railway.app',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow any local network IP (192.168.x.x) for development
    if (origin.match(/^http:\/\/192\.168\.\d+\.\d+:\d+$/)) {
      return callback(null, true);
    }

    // Allow Railway deployment URLs
    if (origin.endsWith('.up.railway.app')) {
      return callback(null, true);
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

// Parse JSON body
app.use(express.json());

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

  await payload.init({
    secret: process.env.PAYLOAD_SECRET!,
    express: app,
    config,
    onInit: async () => {
      payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`);
    },
  });

  payloadReady = true;

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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  // Server-Sent Events endpoint for real-time product updates
  // Note: SSE won't work properly on Vercel serverless due to timeout limitations
  // Store active SSE connections per product
  const productListeners = new Map<string, Set<any>>();

  app.get('/api/products/:id/stream', async (req, res) => {
    const productId = req.params.id;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', productId })}\n\n`);

    // Add this connection to listeners
    if (!productListeners.has(productId)) {
      productListeners.set(productId, new Set());
    }
    productListeners.get(productId)!.add(res);

    console.log(`SSE client connected for product ${productId}. Total listeners: ${productListeners.get(productId)!.size}`);

    // Send initial product status
    try {
      const product = await payload.findByID({
        collection: 'products',
        id: productId,
      });

      const latestBid = await payload.find({
        collection: 'bids',
        where: { product: { equals: productId } },
        sort: '-bidTime',
        limit: 1,
      });

      const status = {
        type: 'update',
        id: product.id,
        updatedAt: product.updatedAt,
        status: product.status,
        currentBid: product.currentBid,
        latestBidTime: latestBid.docs.length > 0 ? latestBid.docs[0].bidTime : null,
        bidCount: latestBid.totalDocs,
      };

      res.write(`data: ${JSON.stringify(status)}\n\n`);
    } catch (error) {
      console.error('Error sending initial status:', error);
    }

    // Keep connection alive with heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      const listeners = productListeners.get(productId);
      if (listeners) {
        listeners.delete(res);
        console.log(`SSE client disconnected for product ${productId}. Remaining: ${listeners.size}`);
        if (listeners.size === 0) {
          productListeners.delete(productId);
        }
      }
    });
  });

  // Helper function to broadcast updates to all listeners of a product
  const broadcastProductUpdate = async (productId: string) => {
    const listeners = productListeners.get(productId);
    if (!listeners || listeners.size === 0) return;

    try {
      const product = await payload.findByID({
        collection: 'products',
        id: productId,
      });

      const latestBid = await payload.find({
        collection: 'bids',
        where: { product: { equals: productId } },
        sort: '-bidTime',
        limit: 1,
      });

      const status = {
        type: 'update',
        id: product.id,
        updatedAt: product.updatedAt,
        status: product.status,
        currentBid: product.currentBid,
        latestBidTime: latestBid.docs.length > 0 ? latestBid.docs[0].bidTime : null,
        bidCount: latestBid.totalDocs,
      };

      const message = `data: ${JSON.stringify(status)}\n\n`;

      // Send to all listeners
      listeners.forEach((res) => {
        try {
          res.write(message);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
          listeners.delete(res);
        }
      });

      console.log(`Broadcasted update for product ${productId} to ${listeners.size} clients`);
    } catch (error) {
      console.error('Error broadcasting product update:', error);
    }
  };

  // Expose broadcast function globally so hooks can call it
  (global as any).broadcastProductUpdate = broadcastProductUpdate;

  // Expose Redis message notification globally for hooks (avoid webpack bundling issues)
  (global as any).publishMessageNotification = publishMessageNotification;

  // Expose global event publisher for hooks (new products, etc.)
  (global as any).publishGlobalEvent = publishGlobalEvent;

  // Sync endpoint to update product currentBid with highest bid
  app.post('/api/sync-bids', async (req, res) => {
    try {
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
      res.status(500).json({ error: error.message });
    }
  });

  // Queue bid endpoint - queues bid to Redis for processing by bid worker
  // This prevents race conditions by processing bids sequentially
  app.post('/api/bid/queue', async (req, res) => {
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

      if (!productId || !amount) {
        return res.status(400).json({ error: 'Missing productId or amount' });
      }

      // Basic validation - get product to check status
      const product: any = await payload.findByID({
        collection: 'products',
        id: productId,
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

      // Check auction end date
      if (new Date(product.auctionEndDate) <= new Date()) {
        return res.status(400).json({ error: 'Auction has ended' });
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
        // If Redis is down, fall back to direct bid creation
        console.warn('[CMS] Redis queue failed, falling back to direct bid creation');

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
      res.status(500).json({ error: error.message });
    }
  });

  // Accept bid endpoint - queues accept action to Redis to prevent race conditions
  app.post('/api/bid/accept', async (req, res) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  // Health check endpoint for Redis status
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      redis: isRedisConnected() ? 'connected' : 'disconnected',
      timestamp: Date.now(),
    });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
          await queueEmail({
            to: buyer.email,
            subject: `Congratulations! You've secured "${product.title}"`,
            html: `
              <h2>Congratulations!</h2>
              <p>Your offer for <strong>${product.title}</strong> has been accepted.</p>
              <p>Amount: ${voidRequest.secondBidderOffer.offerAmount}</p>
              <p>Please check your inbox to coordinate with the seller.</p>
            `,
          });
        }

        if (seller?.email) {
          await queueEmail({
            to: seller.email,
            subject: `${buyer.name} accepted your offer for "${product.title}"`,
            html: `
              <h2>Offer Accepted!</h2>
              <p><strong>${buyer.name}</strong> has accepted your offer for <strong>${product.title}</strong>.</p>
              <p>Amount: ${voidRequest.secondBidderOffer.offerAmount}</p>
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
          await queueEmail({
            to: seller.email,
            subject: `Offer declined for "${product.title}"`,
            html: `
              <h2>Offer Declined</h2>
              <p><strong>${buyer.name}</strong> has declined your offer for <strong>${product.title}</strong>.</p>
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  // Get user limits (bidding and posting)
  app.get('/api/users/limits', async (req, res) => {
    try {
      let currentUserId: number | string | null = (req as any).user?.id || null;

      // JWT fallback for when Payload middleware doesn't set req.user
      if (!currentUserId) {
        const authHeader = req.headers.authorization;
        if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as any;
            if (decoded.id) {
              currentUserId = decoded.id;
            }
          } catch (jwtError) {
            // Token invalid/expired
          }
        }
      }

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
      res.status(500).json({ error: error.message });
    }
  });

  // Only start server if not in serverless environment
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
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
