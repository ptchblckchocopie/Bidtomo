import { Router } from 'express';
import * as Sentry from '@sentry/node';
import type { Payload } from 'payload';
import { requireAuth } from '../middleware/requireAuth';
import { validate, bidQueueSchema, bidAcceptSchema } from '../middleware/validate';
import { bidLimiter } from '../limiters';
import { queueBid, queueAcceptBid, publishProductUpdate } from '../redis';
import { sendError, sendSuccess } from '../middleware/response';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface BidsDeps {
  payload: Payload;
  isProduction: boolean;
}

export function createBidsRouter({ payload, isProduction }: BidsDeps): Router {
  const router = Router();

  // Queue bid endpoint
  router.post('/api/bid/queue', bidLimiter, requireAuth, validate(bidQueueSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { productId, amount, censorName } = req.body;

      const product: any = await payload.findByID({
        collection: 'products',
        id: productId,
        depth: 0,
      });

      if (!product) {
        return sendError(res, 404, 'Product not found');
      }

      if (product.status !== 'available') {
        return sendError(res, 400, `Product is ${product.status}`);
      }

      if (!product.active) {
        return sendError(res, 400, 'Product is not active');
      }

      // Check auction end date (with 2-second buffer)
      const auctionEnd = new Date(product.auctionEndDate).getTime();
      const now = Date.now();
      if (auctionEnd <= now) {
        return sendError(res, 400, 'Auction has ended');
      }
      if (auctionEnd - now < 2000) {
        return sendError(res, 400, 'Auction is ending, bid cannot be processed in time');
      }

      // Validate bid amount
      const currentBid = product.currentBid || 0;
      const minimumBid = currentBid > 0
        ? currentBid + (product.bidInterval || 1)
        : product.startingPrice;

      if (amount < minimumBid) {
        return res.status(400).json({
          success: false,
          error: `Bid must be at least ${minimumBid}`,
          minimumBid,
          currentBid,
        });
      }

      // Check seller is not bidding on their own product
      const sellerId = typeof product.seller === 'object' ? product.seller.id : product.seller;
      if (sellerId === userId) {
        return sendError(res, 400, 'You cannot bid on your own product');
      }

      // Queue the bid
      const result = await queueBid(
        parseInt(productId, 10),
        userId,
        amount,
        censorName || false
      );

      if (!result.success) {
        // Redis down — fall back to direct bid creation with row-level locking
        console.warn('[CMS] Redis queue failed, falling back to direct bid creation');

        const pool = (payload.db as any).pool;
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const lockedResult = await client.query(
            `SELECT id, current_bid, starting_price, bid_interval, status, active, auction_end_date
             FROM products WHERE id = $1 FOR UPDATE`,
            [parseInt(productId, 10)]
          );

          if (lockedResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return sendError(res, 404, 'Product not found');
          }

          const locked = lockedResult.rows[0];

          if (locked.status !== 'available') {
            await client.query('ROLLBACK');
            return sendError(res, 400, `Product is ${locked.status}`);
          }

          if (!locked.active) {
            await client.query('ROLLBACK');
            return sendError(res, 400, 'Product is not active');
          }

          if (new Date(locked.auction_end_date) <= new Date()) {
            await client.query('ROLLBACK');
            return sendError(res, 400, 'Auction has ended');
          }

          const lockedCurrentBid = Number(locked.current_bid) || 0;
          const lockedBidInterval = Number(locked.bid_interval) || 1;
          const lockedStartingPrice = Number(locked.starting_price) || 0;
          const lockedMinimumBid = lockedCurrentBid > 0
            ? lockedCurrentBid + lockedBidInterval
            : lockedStartingPrice;

          if (amount < lockedMinimumBid) {
            await client.query('ROLLBACK');
            return sendError(res, 400, `Bid must be at least ${lockedMinimumBid}`);
          }

          // Shill-bidding check under lock
          const sellerCheck = await client.query(
            `SELECT users_id FROM products_rels WHERE parent_id = $1 AND path = 'seller'`,
            [parseInt(productId, 10)]
          );
          if (sellerCheck.rows.length > 0 && sellerCheck.rows[0].users_id === userId) {
            await client.query('ROLLBACK');
            return sendError(res, 400, 'You cannot bid on your own product');
          }

          // Create bid (Payload v2 schema)
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

          await client.query(
            `UPDATE products SET current_bid = $1, updated_at = NOW() WHERE id = $2`,
            [amount, parseInt(productId, 10)]
          );

          const bidderResult = await client.query(
            `SELECT name FROM users WHERE id = $1`,
            [userId]
          );

          await client.query('COMMIT');

          const bidTime = new Date().toISOString();
          const bidderName = bidderResult.rows[0]?.name || 'Anonymous';

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

          return sendSuccess(res, {
            bidId,
            fallback: true,
            message: 'Bid placed successfully (direct)',
          });
        } catch (error: any) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('[CMS] Fallback bid error:', error);
          Sentry.withScope(scope => {
            if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
            scope.setTag('route', '/api/bid/queue.fallback');
            Sentry.captureException(error);
          });
          return sendError(res, 500, isProduction ? 'Internal server error' : error.message);
        } finally {
          client.release();
        }
      }

      // Early SSE: notify watchers immediately so they see the bid near-instantly.
      // CMS already validated (product active, auction not ended, amount valid).
      const bidderResult = await payload.findByID({
        collection: 'users', id: userId, depth: 0, overrideAccess: true,
      }).catch(() => null);
      publishProductUpdate(parseInt(productId, 10), {
        type: 'bid',
        success: true,
        amount,
        bidderId: userId,
        bidderName: censorName ? 'Anonymous' : (bidderResult?.name || 'Bidder'),
        censorName: censorName || false,
        bidTime: new Date().toISOString(),
      });

      sendSuccess(res, {
        jobId: result.jobId,
        queued: true,
        message: 'Bid queued for processing',
      });
    } catch (error: any) {
      console.error('Error queuing bid:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/bid/queue');
        Sentry.captureException(error);
      });
      sendError(res, 500, isProduction ? 'Internal server error' : error.message);
    }
  });

  // Accept bid endpoint
  router.post('/api/bid/accept', bidLimiter, requireAuth, validate(bidAcceptSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { productId } = req.body;

      const product: any = await payload.findByID({
        collection: 'products',
        id: productId,
      });

      if (!product) {
        return sendError(res, 404, 'Product not found');
      }

      const sellerId = typeof product.seller === 'object' ? product.seller.id : product.seller;
      if (sellerId !== userId) {
        return sendError(res, 403, 'Only the seller can accept bids');
      }

      if (product.status !== 'available') {
        return sendError(res, 400, `Product is already ${product.status}`);
      }

      const bids = await payload.find({
        collection: 'bids',
        where: { product: { equals: productId } },
        sort: '-amount',
        limit: 1,
      });

      if (bids.docs.length === 0) {
        return sendError(res, 400, 'No bids to accept');
      }

      const highestBid: any = bids.docs[0];
      const highestBidderId = typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder;

      const result = await queueAcceptBid(
        parseInt(productId, 10),
        userId,
        highestBidderId,
        highestBid.amount
      );

      if (!result.success) {
        // Fallback to direct update with row-level locking
        console.warn('[CMS] Redis queue failed, falling back to direct accept');

        const pool = (payload.db as any).pool;
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const freshResult = await client.query(
            `SELECT id, title, status FROM products WHERE id = $1 FOR UPDATE`,
            [parseInt(productId, 10)]
          );

          if (freshResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return sendError(res, 404, 'Product not found');
          }

          const freshProduct = freshResult.rows[0];

          if (freshProduct.status !== 'available') {
            await client.query('ROLLBACK');
            return sendError(res, 400, `Product is already ${freshProduct.status}`);
          }

          await client.query(
            `UPDATE products SET status = 'sold', updated_at = NOW() WHERE id = $1`,
            [parseInt(productId, 10)]
          );

          const congratsMessage = `Congratulations! Your bid has been accepted for "${escapeHtml(freshProduct.title)}". Let's discuss the next steps for completing this transaction.`;
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

          const txNotes = `Transaction created for "${escapeHtml(freshProduct.title)}" with winning bid of ${highestBid.amount}`;
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

          return sendSuccess(res, {
            fallback: true,
            message: 'Bid accepted successfully (direct)',
          });
        } catch (error: any) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('[CMS] Fallback accept error:', error);
          Sentry.withScope(scope => {
            if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
            scope.setTag('route', '/api/bid/accept.fallback');
            Sentry.captureException(error);
          });
          return sendError(res, 500, isProduction ? 'Internal server error' : error.message);
        } finally {
          client.release();
        }
      }

      const trackEvent = (global as any).trackEvent;
      if (trackEvent) trackEvent('bid_accepted', userId, { productId, bidderId: highestBidderId, amount: highestBid.amount });

      sendSuccess(res, {
        jobId: result.jobId,
        queued: true,
        message: 'Accept bid queued for processing',
      });
    } catch (error: any) {
      console.error('Error accepting bid:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/bid/accept');
        Sentry.captureException(error);
      });
      sendError(res, 500, isProduction ? 'Internal server error' : error.message);
    }
  });

  // GET /api/product-bids/:productId — fetch bids for a product using correct SQL join
  // (Payload v2 relationship WHERE is broken — returns all bids regardless of product filter)
  router.get('/api/product-bids/:productId', async (req, res) => {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (isNaN(productId)) {
        return sendError(res, 400, 'Invalid product ID');
      }

      const pool = (payload.db as any).pool;
      const result = await pool.query(
        `SELECT b.id, b.amount, b.bid_time as "bidTime", b.censor_name as "censorName",
                b.created_at as "createdAt",
                u.id as "bidderId", u.name as "bidderName"
         FROM bids b
         JOIN bids_rels br ON b.id = br.parent_id AND br.path = 'product'
         JOIN bids_rels br2 ON b.id = br2.parent_id AND br2.path = 'bidder'
         JOIN users u ON br2.users_id = u.id
         WHERE br.products_id = $1
         ORDER BY b.amount DESC`,
        [productId]
      );

      const docs = result.rows.map((row: any) => ({
        id: row.id,
        amount: parseFloat(row.amount),
        bidTime: row.bidTime,
        censorName: row.censorName,
        createdAt: row.createdAt,
        bidder: {
          id: row.bidderId,
          name: row.bidderName,
        },
        product: productId,
      }));

      res.json({
        docs,
        totalDocs: docs.length,
        limit: docs.length,
        totalPages: 1,
        page: 1,
        pagingCounter: 1,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
      });
    } catch (error: any) {
      Sentry.withScope(scope => {
        scope.setTag('route', '/api/product-bids');
        Sentry.captureException(error);
      });
      sendError(res, 500, isProduction ? 'Internal server error' : error.message);
    }
  });

  return router;
}
