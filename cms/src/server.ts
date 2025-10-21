import express from 'express';
import payload from 'payload';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS to allow requests from the frontend
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const start = async () => {
  await payload.init({
    secret: process.env.PAYLOAD_SECRET!,
    express: app,
    onInit: async () => {
      payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`);
    },
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
                product: product.id,
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
                product: product.id,
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

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
};

start();
