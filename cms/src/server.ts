import express from 'express';
import payload from 'payload';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Configure CORS to allow requests from the frontend (including production URLs)
const allowedOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:3001',
  'http://192.168.18.117:5173',
  'http://192.168.18.117:3001',
  'https://www.bidmo.to',
  'https://bidmo.to',
  'https://app.bidmo.to',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

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

const start = async () => {
  // Import config directly
  const config = require('./payload.config').default;

  await payload.init({
    secret: process.env.PAYLOAD_SECRET!,
    express: app,
    config,
    onInit: async () => {
      payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`);
    },
  });

  // JWT auth middleware - runs AFTER Payload initialization
  // This extracts the JWT from Authorization header and validates it
  app.use(async (req, res, next) => {
    // Skip if user is already authenticated via cookie
    if ((req as any).user) {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('JWT ')) {
      const token = authHeader.substring(4);

      try {
        const jwt = require('jsonwebtoken');
        const secret = process.env.PAYLOAD_SECRET!;

        // Decode and verify the JWT
        const decoded: any = jwt.verify(token, secret);

        // Fetch the full user from database using the ID from token
        if (decoded.id) {
          const user = await payload.findByID({
            collection: 'users',
            id: decoded.id,
          });

          // Set req.user for Payload to recognize
          (req as any).user = user;
          console.log('JWT auth successful for user:', user.email);
        }
      } catch (error: any) {
        console.error('JWT verification failed:', error.message);
        // Don't block the request - let Payload's own auth handle it
      }
    }

    next();
  });

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

  // In-memory typing status store
  // Structure: { 'productId:userId': timestamp }
  const typingStatus = new Map<string, number>();
  const TYPING_TIMEOUT = 3000; // 3 seconds

  // Set typing status
  app.post('/api/typing', async (req, res) => {
    try {
      const { product, isTyping } = req.body;
      const userId = (req as any).user?.id;

      if (!userId || !product) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const key = `${product}:${userId}`;

      if (isTyping) {
        // Set typing with current timestamp
        typingStatus.set(key, Date.now());
      } else {
        // Remove typing status
        typingStatus.delete(key);
      }

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
