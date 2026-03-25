import './instrument';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { Pool } from 'pg';
import crypto from 'crypto';
import log from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/marketplace';
const QUEUE_KEY = 'bids:pending';
const FAILED_QUEUE_KEY = 'bids:failed';
const PROCESSING_KEY = 'bids:processing';
const EMAIL_QUEUE_KEY = 'email:queue';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// HTML escape for email templates — prevents stored HTML injection
function escHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Currency symbols for email formatting
const CURRENCY_SYMBOLS: Record<string, string> = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

// Redis clients (separate for blocking operations)
let redisQueue: Redis;
let redisPub: Redis;
let redisConnected = false;

// PostgreSQL pool
const pool = new Pool({
  connectionString: DATABASE_URL,
});

interface BidJob {
  type?: 'bid' | 'accept_bid';
  productId: number;
  bidderId: number;
  amount: number;
  timestamp: number;
  censorName?: boolean;
  retryCount?: number;
  jobId?: string;
  sellerId?: number;
}

interface Product {
  id: number;
  currentBid: number | null;
  startingPrice: number;
  bidInterval: number;
  status: string;
  auctionEndDate: string;
  active: boolean;
}

// Generate unique job ID
function generateJobId(): string {
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

// Initialize Redis with retry logic
async function initRedis(): Promise<void> {
  return new Promise((resolve, reject) => {
    redisQueue = new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 500, 5000);
        log.info({ delay, attempt: times }, 'Redis reconnecting');
        return delay;
      },
      maxRetriesPerRequest: null,
    });

    redisPub = new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 500, 5000);
        return delay;
      },
      maxRetriesPerRequest: null,
    });

    redisQueue.on('connect', () => {
      log.info('Redis queue connected');
      redisConnected = true;
    });

    redisQueue.on('error', (err) => {
      log.error({ err: err.message }, 'Redis queue error');
      redisConnected = false;
    });

    redisQueue.on('close', () => {
      log.info('Redis queue disconnected');
      redisConnected = false;
    });

    redisPub.on('error', (err) => {
      log.error({ err: err.message }, 'Redis pub error');
    });

    // Wait for connection
    redisQueue.once('ready', () => {
      resolve();
    });

    setTimeout(() => {
      if (!redisConnected) {
        log.warn('Redis connection timeout, will retry');
        resolve(); // Continue anyway, Redis has retry logic
      }
    }, 5000);
  });
}

// Save failed bid to database for recovery
async function savePendingBidToDb(job: BidJob): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO pending_bids (product_id, bidder_id, amount, timestamp, censor_name, job_id, job_type, seller_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (job_id) DO NOTHING`,
      [job.productId, job.bidderId, job.amount, new Date(job.timestamp), job.censorName || false, job.jobId, job.type || 'bid', job.sellerId || null]
    );
    log.info({ jobId: job.jobId, type: job.type || 'bid' }, 'Saved pending job to database');
  } catch (error) {
    log.error({ err: error, jobId: job.jobId, productId: job.productId }, 'Failed to save pending bid to database');
    Sentry.captureException(error, { tags: { route: 'worker.savePendingBidToDb' }, extra: { jobId: job.jobId, productId: job.productId } });
  }
}

// Remove processed bid from database
async function removePendingBidFromDb(jobId: string): Promise<void> {
  try {
    await pool.query('DELETE FROM pending_bids WHERE job_id = $1', [jobId]);
  } catch (error) {
    log.error({ err: error, jobId }, 'Failed to remove pending bid from database');
  }
}

// Ensure auto_bids table exists
async function ensureAutoBidsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_bids (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        bidder_id INTEGER NOT NULL,
        max_amount DECIMAL(10, 2) NOT NULL,
        censor_name BOOLEAN DEFAULT FALSE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(product_id, bidder_id)
      )
    `);
    // Ensure censor_name column exists for tables created before this was added
    try {
      await pool.query(`ALTER TABLE auto_bids ADD COLUMN IF NOT EXISTS censor_name BOOLEAN DEFAULT FALSE`);
    } catch {
      // Column may already exist
    }

    // Ensure UNIQUE constraint exists (CREATE TABLE IF NOT EXISTS won't add it to existing tables)
    try {
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'auto_bids_product_id_bidder_id_key'
          ) THEN
            ALTER TABLE auto_bids ADD CONSTRAINT auto_bids_product_id_bidder_id_key UNIQUE (product_id, bidder_id);
          END IF;
        END $$;
      `);
    } catch {
      // Constraint may already exist
    }

    // Deactivate orphaned auto-bids:
    // 1. Products that are no longer available (sold/ended/inactive)
    // 2. Products that no longer exist (deleted after DB reset)
    // 3. Auto-bids created BEFORE the product they reference (product was recreated with same ID)
    try {
      const cleaned = await pool.query(`
        UPDATE auto_bids ab SET active = FALSE, updated_at = NOW()
        WHERE ab.active = TRUE AND (
          -- Product is sold, ended, or inactive
          ab.product_id IN (
            SELECT id FROM products WHERE status != 'available' OR active = FALSE
          )
          -- Product was deleted (ID no longer exists)
          OR NOT EXISTS (
            SELECT 1 FROM products WHERE id = ab.product_id
          )
          -- Product was recreated after auto-bid was set (DB reset scenario)
          OR ab.created_at < (
            SELECT p.created_at FROM products p WHERE p.id = ab.product_id
          )
        )
      `);
      if (cleaned.rowCount && cleaned.rowCount > 0) {
        log.info({ count: cleaned.rowCount }, 'Deactivated orphaned auto-bids');
      }
    } catch (cleanupErr) {
      log.warn({ err: cleanupErr }, 'Failed to clean up orphaned auto-bids (non-fatal)');
    }

    log.info('auto_bids table ensured');
  } catch (error) {
    log.error({ err: error }, 'Failed to ensure auto_bids table');
    Sentry.captureException(error, { tags: { route: 'worker.ensureAutoBidsTable' } });
  }
}

// Recover pending bids from database on startup
async function recoverPendingBids(): Promise<void> {
  try {
    // First, check if the table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'pending_bids'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      log.info('Creating pending_bids table');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pending_bids (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL,
          bidder_id INTEGER NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          timestamp TIMESTAMP NOT NULL,
          censor_name BOOLEAN DEFAULT FALSE,
          job_id VARCHAR(50) UNIQUE NOT NULL,
          retry_count INTEGER DEFAULT 0,
          job_type VARCHAR(20) DEFAULT 'bid',
          seller_id INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      log.info('Created pending_bids table');
      return;
    }

    // Ensure new columns exist for accept_bid crash recovery
    try {
      await pool.query(`ALTER TABLE pending_bids ADD COLUMN IF NOT EXISTS job_type VARCHAR(20) DEFAULT 'bid'`);
      await pool.query(`ALTER TABLE pending_bids ADD COLUMN IF NOT EXISTS seller_id INTEGER`);
    } catch (error) {
      // Columns may already exist
    }

    const result = await pool.query(
      `SELECT * FROM pending_bids ORDER BY created_at ASC`
    );

    if (result.rows.length > 0) {
      log.info({ count: result.rows.length }, 'Recovering pending bids from database');

      for (const row of result.rows) {
        const job: BidJob = {
          type: row.job_type || 'bid',
          productId: row.product_id,
          bidderId: row.bidder_id,
          amount: parseFloat(row.amount),
          timestamp: new Date(row.timestamp).getTime(),
          censorName: row.censor_name,
          retryCount: row.retry_count || 0,
          jobId: row.job_id,
          sellerId: row.seller_id || undefined,
        };

        // Re-queue the job
        if (redisConnected) {
          await redisQueue.rpush(QUEUE_KEY, JSON.stringify(job));
          log.info({ jobId: job.jobId }, 'Re-queued bid');
        }
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to recover pending bids');
    Sentry.captureException(error, { tags: { route: 'worker.recoverPendingBids' } });
  }
}

// Process a single bid
async function processBid(job: BidJob): Promise<{ success: boolean; error?: string; bidId?: number; bidderName?: string; bidTime?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current product state with lock
    const productResult = await client.query<Product>(
      `SELECT id, current_bid as "currentBid", starting_price as "startingPrice",
              bid_interval as "bidInterval", status, auction_end_date as "auctionEndDate", active
       FROM products WHERE id = $1 FOR UPDATE`,
      [job.productId]
    );

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Product not found' };
    }

    const product = productResult.rows[0];

    // Validate product is available for bidding
    if (product.status !== 'available') {
      await client.query('ROLLBACK');
      return { success: false, error: `Product is ${product.status}` };
    }

    if (!product.active) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Product is not active' };
    }

    // Check auction end date
    if (new Date(product.auctionEndDate) <= new Date()) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Auction has ended' };
    }

    // Validate bid amount is a valid number
    if (typeof job.amount !== 'number' || isNaN(job.amount) || job.amount <= 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Invalid bid amount' };
    }

    // Shill bidding check: bidder cannot be the product seller
    const sellerCheck = await client.query(
      `SELECT users_id FROM products_rels WHERE parent_id = $1 AND path = 'seller'`,
      [job.productId]
    );
    if (sellerCheck.rows.length > 0 && sellerCheck.rows[0].users_id === job.bidderId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You cannot bid on your own product' };
    }

    // Validate bid amount (ensure numeric values)
    const currentBid = Number(product.currentBid) || 0;
    const bidInterval = Number(product.bidInterval) || 1;
    const startingPrice = Number(product.startingPrice) || 0;
    const minimumBid = currentBid > 0
      ? currentBid + bidInterval
      : startingPrice;

    if (job.amount < minimumBid) {
      await client.query('ROLLBACK');
      return { success: false, error: `Bid must be at least ${minimumBid}` };
    }

    // Create the bid (PayloadCMS schema - relationships are in separate table)
    const bidResult = await client.query(
      `INSERT INTO bids (amount, bid_time, censor_name, created_at, updated_at)
       VALUES ($1, NOW(), $2, NOW(), NOW())
       RETURNING id`,
      [job.amount, job.censorName || false]
    );

    const bidId = bidResult.rows[0].id;

    // Create relationship to product in bids_rels table
    await client.query(
      `INSERT INTO bids_rels (parent_id, path, products_id)
       VALUES ($1, $2, $3)`,
      [bidId, 'product', job.productId]
    );

    // Create relationship to bidder in bids_rels table
    await client.query(
      `INSERT INTO bids_rels (parent_id, path, users_id)
       VALUES ($1, $2, $3)`,
      [bidId, 'bidder', job.bidderId]
    );

    // Update product's current bid
    await client.query(
      `UPDATE products SET current_bid = $1, updated_at = NOW() WHERE id = $2`,
      [job.amount, job.productId]
    );

    // Get bidder name for SSE event
    const bidderResult = await client.query(
      `SELECT name FROM users WHERE id = $1`,
      [job.bidderId]
    );
    const bidderName = bidderResult.rows[0]?.name || 'Anonymous';

    await client.query('COMMIT');

    const bidTime = new Date().toISOString();
    log.info({ bidId, productId: job.productId, amount: job.amount }, 'Bid processed');

    return { success: true, bidId, bidderName, bidTime };
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ err: error, productId: job.productId, bidderId: job.bidderId, amount: job.amount }, 'Error processing bid');
    Sentry.captureException(error, { tags: { route: 'worker.processBid' }, extra: { productId: job.productId, bidderId: job.bidderId, amount: job.amount } });
    return { success: false, error: String(error) };
  } finally {
    client.release();
  }
}

// Queue email to the email service via Redis
async function queueEmail(emailData: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: {
    type?: string;
    productId?: number;
    userId?: number;
  };
}): Promise<boolean> {
  if (!redisConnected) {
    log.warn('Redis not connected, cannot queue email');
    return false;
  }

  try {
    const queuedEmail = {
      ...emailData,
      id: `email_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      queuedAt: Date.now(),
      attempts: 0,
    };
    await redisPub.rpush(EMAIL_QUEUE_KEY, JSON.stringify(queuedEmail));
    log.info({ to: emailData.to, subject: emailData.subject }, 'Queued email');
    return true;
  } catch (error) {
    log.error({ err: error, to: emailData.to }, 'Failed to queue email');
    return false;
  }
}

// Process accept bid - marks product as sold atomically
async function processAcceptBid(job: BidJob): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get current product state with lock (including title for the message)
    const productResult = await client.query<Product & { title: string }>(
      `SELECT id, title, current_bid as "currentBid", status, active
       FROM products WHERE id = $1 FOR UPDATE`,
      [job.productId]
    );

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Product not found' };
    }

    const product = productResult.rows[0];

    // Get buyer (bidder) details
    const buyerResult = await client.query<{ id: number; name: string; email: string; currency: string }>(
      `SELECT id, name, email, currency FROM users WHERE id = $1`,
      [job.bidderId]
    );
    const buyer = buyerResult.rows[0];

    // Get seller details
    const sellerResult = await client.query<{ id: number; name: string; email: string; currency: string }>(
      `SELECT id, name, email, currency FROM users WHERE id = $1`,
      [job.sellerId]
    );
    const seller = sellerResult.rows[0];

    // Verify sellerId matches product owner (defense-in-depth)
    const sellerCheck = await client.query(
      `SELECT users_id FROM products_rels WHERE parent_id = $1 AND path = 'seller'`,
      [job.productId]
    );
    if (sellerCheck.rows.length === 0 || sellerCheck.rows[0].users_id !== job.sellerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Seller does not own this product' };
    }

    // Validate product is still available
    if (product.status !== 'available') {
      await client.query('ROLLBACK');
      return { success: false, error: `Product is already ${product.status}` };
    }

    // Update product status to 'sold'
    await client.query(
      `UPDATE products SET status = 'sold', updated_at = NOW() WHERE id = $1`,
      [job.productId]
    );

    // Deactivate all auto-bids for this product — auction is over
    await client.query(
      `UPDATE auto_bids SET active = FALSE, updated_at = NOW() WHERE product_id = $1 AND active = TRUE`,
      [job.productId]
    );

    // Create congratulation message from seller to buyer
    const congratsMessage = `Congratulations! Your bid has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`;

    const messageResult = await client.query(
      `INSERT INTO messages (message, read, created_at, updated_at)
       VALUES ($1, false, NOW(), NOW())
       RETURNING id`,
      [congratsMessage]
    );
    const messageId = messageResult.rows[0].id;

    // Create message relationships (product, sender=seller, receiver=buyer)
    await client.query(
      `INSERT INTO messages_rels (parent_id, path, products_id)
       VALUES ($1, 'product', $2)`,
      [messageId, job.productId]
    );
    await client.query(
      `INSERT INTO messages_rels (parent_id, path, users_id)
       VALUES ($1, 'sender', $2)`,
      [messageId, job.sellerId]
    );
    await client.query(
      `INSERT INTO messages_rels (parent_id, path, users_id)
       VALUES ($1, 'receiver', $2)`,
      [messageId, job.bidderId]
    );

    // Create transaction record
    const transactionNotes = `Transaction created for "${product.title}" with winning bid of ${job.amount}`;

    const transactionResult = await client.query(
      `INSERT INTO transactions (amount, status, notes, created_at, updated_at)
       VALUES ($1, 'pending', $2, NOW(), NOW())
       RETURNING id`,
      [job.amount, transactionNotes]
    );
    const transactionId = transactionResult.rows[0].id;

    // Create transaction relationships (product, seller, buyer)
    await client.query(
      `INSERT INTO transactions_rels (parent_id, path, products_id)
       VALUES ($1, 'product', $2)`,
      [transactionId, job.productId]
    );
    await client.query(
      `INSERT INTO transactions_rels (parent_id, path, users_id)
       VALUES ($1, 'seller', $2)`,
      [transactionId, job.sellerId]
    );
    await client.query(
      `INSERT INTO transactions_rels (parent_id, path, users_id)
       VALUES ($1, 'buyer', $2)`,
      [transactionId, job.bidderId]
    );

    await client.query('COMMIT');

    log.info({ productId: job.productId, messageId, transactionId }, 'Accept bid processed, product marked as sold');

    // Publish message notification to buyer via SSE (with full message data)
    if (redisConnected) {
      try {
        const now = new Date().toISOString();
        const channel = `sse:user:${job.bidderId}`;
        const notification = JSON.stringify({
          type: 'new_message',
          messageId,
          productId: job.productId,
          senderId: job.sellerId,
          preview: congratsMessage.substring(0, 50),
          timestamp: Date.now(),
          message: {
            id: messageId,
            message: congratsMessage,
            sender: { id: job.sellerId, name: seller?.name, email: seller?.email },
            receiver: { id: job.bidderId },
            product: { id: job.productId },
            read: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        await redisPub.publish(channel, notification);
        log.info({ buyerId: job.bidderId, channel }, 'Published message notification');
      } catch (notifyError) {
        log.error({ err: notifyError, buyerId: job.bidderId }, 'Failed to publish message notification');
        Sentry.captureException(notifyError, { level: 'warning', tags: { route: 'worker.processAcceptBid.notify' } });
      }
    }

    // Send email notifications to buyer and seller
    const currencySymbol = CURRENCY_SYMBOLS[seller?.currency || 'PHP'] || '₱';
    const platformUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Email to buyer - congratulations for winning
    if (buyer?.email) {
      const safeBuyerName = escHtml(buyer.name || 'Buyer');
      const safeSellerName = escHtml(seller?.name || 'Seller');
      const safeTitle = escHtml(product.title);

      await queueEmail({
        to: buyer.email,
        subject: `Congratulations! You won the bid for "${product.title}"`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">Congratulations!</h1>
            </div>
            <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px;">
              <p>Hi ${safeBuyerName},</p>
              <p>Great news! Your bid has been accepted for <strong>${safeTitle}</strong>.</p>
              <div style="background: #fef3c7; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Winning Bid:</strong> ${escHtml(currencySymbol)}${escHtml(job.amount.toLocaleString())}</p>
                <p style="margin: 5px 0;"><strong>Seller:</strong> ${safeSellerName}</p>
              </div>
              <p>The seller has been notified and will reach out to you shortly to discuss the next steps.</p>
              <p><a href="${escHtml(platformUrl)}/inbox?product=${job.productId}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px;">Go to Inbox</a></p>
              <p style="margin-top: 20px;">Thank you for using Veent Marketplace!</p>
            </div>
          </div>
        `,
        metadata: { type: 'bid_won_buyer', productId: job.productId, userId: job.bidderId },
      });
    }

    // Email to seller - item sold notification
    if (seller?.email) {
      const safeBuyerName = escHtml(buyer?.name || 'Buyer');
      const safeBuyerEmail = escHtml(buyer?.email || 'N/A');
      const safeSellerName = escHtml(seller.name || 'Seller');
      const safeTitle = escHtml(product.title);

      await queueEmail({
        to: seller.email,
        subject: `Your item "${product.title}" has been sold!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">Item Sold!</h1>
            </div>
            <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px;">
              <p>Hi ${safeSellerName},</p>
              <p>Great news! Your item <strong>${safeTitle}</strong> has been sold.</p>
              <div style="background: #dcfce7; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Winning Bid:</strong> ${escHtml(currencySymbol)}${escHtml(job.amount.toLocaleString())}</p>
                <p style="margin: 5px 0;"><strong>Buyer:</strong> ${safeBuyerName} (${safeBuyerEmail})</p>
              </div>
              <p>A conversation has been automatically created. Please reach out to the buyer to arrange payment and delivery.</p>
              <p><a href="${escHtml(platformUrl)}/inbox?product=${job.productId}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 15px;">Contact Buyer</a></p>
              <p style="margin-top: 20px;">Thank you for selling on Veent Marketplace!</p>
            </div>
          </div>
        `,
        metadata: { type: 'bid_won_seller', productId: job.productId, userId: job.sellerId },
      });
    }

    log.info({ productId: job.productId, buyerId: job.bidderId, sellerId: job.sellerId }, 'Queued email notifications for buyer and seller');

    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    log.error({ err: error, productId: job.productId, sellerId: job.sellerId, bidderId: job.bidderId }, 'Error processing accept bid');
    Sentry.captureException(error, { tags: { route: 'worker.processAcceptBid' }, extra: { productId: job.productId, sellerId: job.sellerId, bidderId: job.bidderId } });
    return { success: false, error: String(error) };
  } finally {
    client.release();
  }
}

// Publish bid result to SSE service via Redis
async function publishBidResult(
  productId: number,
  result: {
    success: boolean;
    bidId?: number;
    amount?: number;
    bidderId?: number;
    error?: string;
    bidderName?: string;
    censorName?: boolean;
    bidTime?: string;
  }
) {
  if (!redisConnected) {
    log.warn({ productId }, 'Redis not connected, cannot publish bid result');
    return;
  }

  const channel = `sse:product:${productId}`;
  const message = JSON.stringify({
    type: 'bid',
    ...result,
    timestamp: Date.now(),
  });

  try {
    await redisPub.publish(channel, message);
    log.info({ channel, productId }, 'Published bid result');
  } catch (error) {
    log.error({ err: error, channel, productId }, 'Failed to publish bid result');
    Sentry.captureException(error, { level: 'warning', tags: { route: 'worker.publishBidResult' } });
  }
}

// Publish accept bid result to SSE service via Redis
async function publishAcceptResult(productId: number, result: { success: boolean; winnerId?: number; amount?: number; error?: string }) {
  if (!redisConnected) {
    log.warn({ productId }, 'Redis not connected, cannot publish accept result');
    return;
  }

  const channel = `sse:product:${productId}`;
  const message = JSON.stringify({
    type: 'accepted',
    status: 'sold',
    ...result,
    timestamp: Date.now(),
  });

  try {
    await redisPub.publish(channel, message);
    log.info({ channel, productId }, 'Published accept result');
  } catch (error) {
    log.error({ err: error, channel, productId }, 'Failed to publish accept result');
    Sentry.captureException(error, { level: 'warning', tags: { route: 'worker.publishAcceptResult' } });
  }
}

// Process auto-bids after a successful bid — checks if any auto-bidders should counter-bid
async function processAutoBids(productId: number, currentBidAmount: number, currentBidderId: number): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the product row to get fresh state and prevent races
    const productResult = await client.query(
      `SELECT id, current_bid as "currentBid", starting_price as "startingPrice",
              bid_interval as "bidInterval", status, auction_end_date as "auctionEndDate", active
       FROM products WHERE id = $1 FOR UPDATE`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    const product = productResult.rows[0];

    // Don't process auto-bids if auction is no longer available
    if (product.status !== 'available' || !product.active || new Date(product.auctionEndDate) <= new Date()) {
      await client.query('ROLLBACK');
      return;
    }

    let runningBid = Number(product.currentBid) || 0;
    const bidInterval = Number(product.bidInterval) || 1;
    const startingPrice = Number(product.startingPrice) || 0;

    // Get the seller so we can exclude them from auto-bidding (defense-in-depth)
    const sellerResult = await client.query(
      `SELECT users_id FROM products_rels WHERE parent_id = $1 AND path = 'seller'`,
      [productId]
    );
    const sellerId = sellerResult.rows[0]?.users_id;

    // Get ALL active auto-bids for this product (excluding seller)
    const allAutoBidsResult = await client.query(
      `SELECT id, bidder_id, max_amount, censor_name, created_at FROM auto_bids
       WHERE product_id = $1 AND active = TRUE AND bidder_id != COALESCE($2, 0)
       ORDER BY max_amount DESC, created_at ASC
       FOR UPDATE`,
      [productId, sellerId]
    );

    // Deactivate any auto-bids from the seller (shouldn't exist, but clean up)
    if (sellerId) {
      await client.query(
        `UPDATE auto_bids SET active = FALSE, updated_at = NOW()
         WHERE product_id = $1 AND bidder_id = $2 AND active = TRUE`,
        [productId, sellerId]
      );
    }

    // Build a map of auto-bidders for fast lookup
    const autoBidMap = new Map<number, { bidderId: number; maxAmount: number; censorName: boolean; createdAt: number }>();
    for (const row of allAutoBidsResult.rows) {
      autoBidMap.set(row.bidder_id, {
        bidderId: row.bidder_id,
        maxAmount: parseFloat(row.max_amount),
        censorName: row.censor_name || false,
        createdAt: new Date(row.created_at).getTime(),
      });
    }

    // Check if there's at least one auto-bidder who can counter the current bid
    const firstNextMin = runningBid > 0 ? runningBid + bidInterval : startingPrice;
    let hasCompetitor = false;
    for (const [bidderId, ab] of autoBidMap) {
      if (bidderId !== currentBidderId && ab.maxAmount >= firstNextMin) {
        hasCompetitor = true;
        break;
      }
    }

    if (!hasCompetitor) {
      // No competitors — deactivate exhausted auto-bids and exit
      await client.query(
        `UPDATE auto_bids SET active = FALSE, updated_at = NOW()
         WHERE product_id = $1 AND active = TRUE AND max_amount < $2`,
        [productId, firstNextMin]
      );
      await client.query('COMMIT');
      return;
    }

    // --- Incremental counter-bidding loop ---
    // Instead of jumping to the final price, place bids one increment at a time.
    // This creates a visible bidding war in the bid history.
    const placedBids: Array<{ bidId: number; amount: number; bidderId: number; censorName: boolean }> = [];
    let currentHighBidderId = currentBidderId;

    // Safety limit: cap at 50 incremental steps, then jump to final for remainder
    const MAX_INCREMENTAL_STEPS = 50;

    for (let step = 0; step < MAX_INCREMENTAL_STEPS; step++) {
      const nextMin = runningBid > 0 ? runningBid + bidInterval : startingPrice;

      // Find the best counter-bidder: not the current high bidder, can beat runningBid
      // Prefer highest maxAmount, then earliest createdAt (first-come-first-served)
      const currentHolderAB = autoBidMap.get(currentHighBidderId);
      let bestCounter: { bidderId: number; maxAmount: number; censorName: boolean; createdAt: number } | null = null;
      for (const [bidderId, ab] of autoBidMap) {
        if (bidderId === currentHighBidderId) continue;
        if (ab.maxAmount <= runningBid) continue; // Can't beat current bid at all

        // First-come-first-served tiebreaker: if this counter-bidder would bid their
        // exact max, and the current high bidder has the same max but set their auto-bid
        // earlier, skip — the later bidder can't win a tie against an earlier one.
        const wouldBidAmount = ab.maxAmount >= nextMin ? nextMin : ab.maxAmount;
        if (wouldBidAmount === ab.maxAmount && currentHolderAB &&
            currentHolderAB.maxAmount === ab.maxAmount &&
            currentHolderAB.createdAt < ab.createdAt) {
          continue; // Current holder was first with same max — this counter can't win
        }

        if (!bestCounter || ab.maxAmount > bestCounter.maxAmount ||
            (ab.maxAmount === bestCounter.maxAmount && ab.createdAt < bestCounter.createdAt)) {
          bestCounter = ab;
        }
      }

      if (!bestCounter) break; // No one can counter — current high bidder wins

      // Determine bid amount: standard increment if affordable, otherwise their max
      // (allows sub-interval final bids so both sides use their full max — fair tiebreaker)
      const counterBidAmount = bestCounter.maxAmount >= nextMin ? nextMin : bestCounter.maxAmount;

      // Place the counter-bid
      const bidResult = await client.query(
        `INSERT INTO bids (amount, bid_time, censor_name, created_at, updated_at)
         VALUES ($1, NOW(), $2, NOW(), NOW()) RETURNING id`,
        [counterBidAmount, bestCounter.censorName]
      );
      const bidId = bidResult.rows[0].id;

      await client.query(
        `INSERT INTO bids_rels (parent_id, path, products_id) VALUES ($1, 'product', $2)`,
        [bidId, productId]
      );
      await client.query(
        `INSERT INTO bids_rels (parent_id, path, users_id) VALUES ($1, 'bidder', $2)`,
        [bidId, bestCounter.bidderId]
      );

      placedBids.push({ bidId, amount: counterBidAmount, bidderId: bestCounter.bidderId, censorName: bestCounter.censorName });
      runningBid = counterBidAmount;
      currentHighBidderId = bestCounter.bidderId;
    }

    // If we hit the step limit and there's still competition, resolve remainder in one jump
    if (placedBids.length >= MAX_INCREMENTAL_STEPS) {
      const nextMin = runningBid + bidInterval;
      const remaining: Array<{ bidderId: number; maxAmount: number; censorName: boolean; createdAt: number }> = [];
      for (const [, ab] of autoBidMap) {
        if (ab.maxAmount > runningBid) {
          remaining.push(ab);
        }
      }
      remaining.sort((a, b) => b.maxAmount - a.maxAmount || a.createdAt - b.createdAt);

      if (remaining.length >= 2) {
        const winner = remaining[0];
        const second = remaining[1];
        let finalAmount = Math.min(winner.maxAmount, second.maxAmount + bidInterval);
        finalAmount = Math.max(finalAmount, nextMin);

        if (finalAmount > runningBid && winner.bidderId !== currentHighBidderId) {
          const bidResult = await client.query(
            `INSERT INTO bids (amount, bid_time, censor_name, created_at, updated_at)
             VALUES ($1, NOW(), $2, NOW(), NOW()) RETURNING id`,
            [finalAmount, winner.censorName]
          );
          const bidId = bidResult.rows[0].id;
          await client.query(
            `INSERT INTO bids_rels (parent_id, path, products_id) VALUES ($1, 'product', $2)`,
            [bidId, productId]
          );
          await client.query(
            `INSERT INTO bids_rels (parent_id, path, users_id) VALUES ($1, 'bidder', $2)`,
            [bidId, winner.bidderId]
          );
          placedBids.push({ bidId, amount: finalAmount, bidderId: winner.bidderId, censorName: winner.censorName });
          runningBid = finalAmount;
          currentHighBidderId = winner.bidderId;
        }
      }
    }

    // Update product's current bid to final amount
    const originalBid = Number(product.currentBid) || 0;
    if (runningBid > originalBid) {
      await client.query(
        `UPDATE products SET current_bid = $1, updated_at = NOW() WHERE id = $2`,
        [runningBid, productId]
      );
    }

    // Deactivate auto-bids that can no longer compete
    const finalMinimum = runningBid + bidInterval;
    await client.query(
      `UPDATE auto_bids SET active = FALSE, updated_at = NOW()
       WHERE product_id = $1 AND active = TRUE AND max_amount < $2`,
      [productId, finalMinimum]
    );

    await client.query('COMMIT');

    // --- Publish SSE events for all placed bids ---
    if (redisConnected && placedBids.length > 0) {
      // Batch-fetch bidder names
      const bidderIds = [...new Set(placedBids.map(b => b.bidderId))];
      const bidderNamesResult = await pool.query(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [bidderIds]
      );
      const bidderNames = new Map<number, string>();
      for (const row of bidderNamesResult.rows) {
        bidderNames.set(row.id, row.name || 'Anonymous');
      }

      try {
        const channel = `sse:product:${productId}`;
        for (const bid of placedBids) {
          const message = JSON.stringify({
            type: 'bid',
            success: true,
            bidId: bid.bidId,
            amount: bid.amount,
            bidderId: bid.bidderId,
            bidderName: bidderNames.get(bid.bidderId) || 'Anonymous',
            censorName: bid.censorName,
            bidTime: new Date().toISOString(),
            isAutoBid: true,
            timestamp: Date.now(),
          });
          await redisPub.publish(channel, message);
        }

        // Publish final state to global channel for browse page
        const lastBid = placedBids[placedBids.length - 1];
        const globalMessage = JSON.stringify({
          type: 'bid',
          productId,
          amount: lastBid.amount,
          isAutoBid: true,
          timestamp: Date.now(),
        });
        await redisPub.publish('sse:global', globalMessage);

        log.info({ channel, count: placedBids.length, productId }, 'Published auto-bid results');
      } catch (publishError) {
        log.error({ err: publishError, productId }, 'Failed to publish auto-bid results');
        Sentry.captureException(publishError, { level: 'warning', tags: { route: 'worker.processAutoBids.publish' } });
      }
    }

    if (placedBids.length > 0) {
      const lastBid = placedBids[placedBids.length - 1];
      log.info({ productId, totalBids: placedBids.length, finalAmount: lastBid.amount, winnerId: lastBid.bidderId }, 'Auto-bid resolution complete');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    log.error({ err: error, productId, currentBidAmount, currentBidderId }, 'Error processing auto-bids');
    Sentry.captureException(error, { tags: { route: 'worker.processAutoBids' }, extra: { productId, currentBidAmount, currentBidderId } });
  } finally {
    client.release();
  }
}

// Move job to failed queue after max retries
async function moveToFailedQueue(job: BidJob, error: string): Promise<void> {
  const failedJob = {
    ...job,
    error,
    failedAt: Date.now(),
  };

  try {
    await redisQueue.rpush(FAILED_QUEUE_KEY, JSON.stringify(failedJob));
    log.info({ jobId: job.jobId, error }, 'Moved job to failed queue');
  } catch (err) {
    log.error({ err, jobId: job.jobId }, 'Failed to move to failed queue');
    Sentry.captureException(err, { tags: { route: 'worker.moveToFailedQueue' }, extra: { jobId: job.jobId, error } });
  }
}

// Fast pre-check: reject bids that are obviously stale without acquiring a row lock.
// Uses a plain SELECT (no FOR UPDATE) so it doesn't block other transactions.
async function fastRejectCheck(job: BidJob): Promise<{ reject: boolean; error?: string }> {
  try {
    const result = await pool.query(
      `SELECT current_bid, starting_price, bid_interval, status, active,
              auction_end_date FROM products WHERE id = $1`,
      [job.productId]
    );

    if (result.rows.length === 0) {
      return { reject: true, error: 'Product not found' };
    }

    const row = result.rows[0];

    if (row.status !== 'available') {
      return { reject: true, error: `Product is ${row.status}` };
    }

    if (!row.active) {
      return { reject: true, error: 'Product is not active' };
    }

    if (new Date(row.auction_end_date) <= new Date()) {
      return { reject: true, error: 'Auction has ended' };
    }

    const currentBid = Number(row.current_bid) || 0;
    const bidInterval = Number(row.bid_interval) || 1;
    const startingPrice = Number(row.starting_price) || 0;
    const minimumBid = currentBid > 0 ? currentBid + bidInterval : startingPrice;

    if (job.amount < minimumBid) {
      return { reject: true, error: `Bid must be at least ${minimumBid}` };
    }

    return { reject: false };
  } catch {
    // On error, let the full processBid() handle it (don't reject prematurely)
    return { reject: false };
  }
}

// Drain and deduplicate: when queue is deep, pull all pending bids for the same
// product, keep only the highest, and fast-reject the rest in bulk.
async function drainAndDeduplicateQueue(firstJob: BidJob): Promise<BidJob[]> {
  // Check queue depth
  const queueLen = await redisQueue.llen(QUEUE_KEY);
  if (queueLen < 5) {
    return [firstJob]; // Queue is short, just process normally
  }

  // Pull up to 200 additional jobs from the queue in a single LRANGE+LTRIM
  const jobs: BidJob[] = [firstJob];
  const maxDrain = Math.min(queueLen, 200);

  // Atomic batch: read all items then trim, instead of sequential LPOP
  const rawItems = await redisQueue.lrange(QUEUE_KEY, 0, maxDrain - 1);
  if (rawItems.length > 0) {
    await redisQueue.ltrim(QUEUE_KEY, rawItems.length, -1);
    for (const raw of rawItems) {
      try {
        const job: BidJob = JSON.parse(raw);
        if (!job.jobId) job.jobId = generateJobId();
        jobs.push(job);
      } catch (parseErr) {
        log.warn({ rawPreview: raw.substring(0, 200) }, 'Skipping malformed job in queue');
        Sentry.captureException(parseErr, { level: 'warning', tags: { route: 'worker.drainAndDeduplicate' }, extra: { rawPreview: raw.substring(0, 200) } });
      }
    }
  }

  if (jobs.length <= 1) return jobs;

  log.info({ count: jobs.length }, 'Drained jobs from queue for batch processing');

  // Group by productId — for each product, keep only the highest bid
  const byProduct = new Map<number, BidJob[]>();
  const nonBidJobs: BidJob[] = []; // accept_bid jobs pass through untouched

  for (const job of jobs) {
    if (job.type === 'accept_bid') {
      nonBidJobs.push(job);
      continue;
    }
    const group = byProduct.get(job.productId) || [];
    group.push(job);
    byProduct.set(job.productId, group);
  }

  const survivors: BidJob[] = [...nonBidJobs];
  let rejected = 0;

  for (const [productId, group] of byProduct) {
    if (group.length <= 1) {
      survivors.push(...group);
      continue;
    }

    // Sort descending by amount — highest bid first
    group.sort((a, b) => b.amount - a.amount);
    survivors.push(group[0]); // Keep the highest

    // Fast-reject the rest
    for (let i = 1; i < group.length; i++) {
      const loser = group[i];
      rejected++;
      await publishBidResult(productId, {
        success: false,
        error: `Outbid — a higher bid of ${group[0].amount} is being processed`,
        amount: loser.amount,
        bidderId: loser.bidderId,
      });
    }
  }

  if (rejected > 0) {
    log.info({ rejected, remaining: survivors.length }, 'Batch-rejected lower bids');
  }

  // Re-queue survivors that aren't the first job (they'll be picked up next iteration)
  // Process them in order: accept_bid jobs first, then bids by descending amount
  if (survivors.length > 1) {
    const toRequeue = survivors.slice(1).reverse().map(s => JSON.stringify(s));
    await redisQueue.lpush(QUEUE_KEY, ...toRequeue);
  }

  return [survivors[0]];
}

// Main worker loop
async function runWorker() {
  log.info({ redis: REDIS_URL, database: DATABASE_URL.replace(/:[^@]+@/, ':***@'), queue: QUEUE_KEY }, 'Bid worker starting');

  // Initialize Redis
  await initRedis();

  // Recover any pending bids from previous crash
  await recoverPendingBids();

  // Ensure auto_bids table exists
  await ensureAutoBidsTable();

  log.info('Bid worker started');

  while (true) {
    try {
      if (!redisConnected) {
        log.info('Waiting for Redis connection');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Blocking pop - wait for new jobs (timeout 1 second for fast responsiveness)
      const result = await redisQueue.blpop(QUEUE_KEY, 1);

      if (!result) continue;

      const [, jobData] = result;
      const job: BidJob = JSON.parse(jobData);

      // Ensure job has an ID
      if (!job.jobId) {
        job.jobId = generateJobId();
      }

      // Handle different job types
      if (job.type === 'accept_bid') {
        // Process accept bid
        log.info({ productId: job.productId, jobId: job.jobId }, 'Processing accept_bid');

        // Save to database in case of crash
        await savePendingBidToDb(job);

        const acceptResult = await processAcceptBid(job);

        if (acceptResult.success) {
          // Remove from pending
          await removePendingBidFromDb(job.jobId!);

          await publishAcceptResult(job.productId, {
            success: true,
            winnerId: job.bidderId,
            amount: job.amount,
          });
          log.info({ productId: job.productId }, 'Accept bid completed');
        } else {
          // Check if it's a validation error (non-retriable)
          const isValidationError = [
            'Product not found',
            'Product is already',
            'Seller does not own',
          ].some((msg) => acceptResult.error?.includes(msg));

          if (isValidationError) {
            await removePendingBidFromDb(job.jobId!);
            await publishAcceptResult(job.productId, {
              success: false,
              error: acceptResult.error,
            });
            log.info({ productId: job.productId, reason: acceptResult.error }, 'Accept bid rejected');
          } else {
            // Transient error - retry
            const retryCount = (job.retryCount || 0) + 1;

            if (retryCount < MAX_RETRIES) {
              job.retryCount = retryCount;
              log.info({ jobId: job.jobId, attempt: retryCount, maxRetries: MAX_RETRIES }, 'Retrying accept_bid');
              await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * retryCount));
              await redisQueue.rpush(QUEUE_KEY, JSON.stringify(job));
            } else {
              log.error({ jobId: job.jobId, maxRetries: MAX_RETRIES }, 'Accept bid failed after max retries');
              await moveToFailedQueue(job, acceptResult.error || 'Unknown error');
              await removePendingBidFromDb(job.jobId!);
              await publishAcceptResult(job.productId, {
                success: false,
                error: 'Accept bid processing failed. Please try again.',
              });
            }
          }
        }
      } else {
        // Process regular bid
        log.info({ productId: job.productId, amount: job.amount, jobId: job.jobId }, 'Processing bid');

        // --- Optimization 1: Batch dedup ---
        // If queue is deep, drain it and reject lower bids for the same product.
        const [jobToProcess] = await drainAndDeduplicateQueue(job);

        // --- Optimization 2: Fast reject ---
        // Quick check without row lock — skips the expensive FOR UPDATE transaction
        // for bids that are already outbid. Also covers auction-ended check.
        const preCheck = await fastRejectCheck(jobToProcess);
        if (preCheck.reject) {
          log.info({ jobId: jobToProcess.jobId, reason: preCheck.error }, 'Fast-rejected bid');
          publishBidResult(jobToProcess.productId, {
            success: false,
            error: preCheck.error,
            amount: jobToProcess.amount,
            bidderId: jobToProcess.bidderId,
          });
          continue;
        }

        // Save to database in case of crash (fire-and-forget — don't block hot path)
        savePendingBidToDb(jobToProcess);

        const bidResult = await processBid(jobToProcess);

        if (bidResult.success) {
          // Remove from pending bids (fire-and-forget)
          removePendingBidFromDb(jobToProcess.jobId!);

          // Publish result to SSE with full bid data (fire-and-forget)
          publishBidResult(jobToProcess.productId, {
            ...bidResult,
            amount: jobToProcess.amount,
            bidderId: jobToProcess.bidderId,
            censorName: jobToProcess.censorName,
          });

          // Check for active auto-bids that should counter-bid (non-blocking)
          try {
            await processAutoBids(jobToProcess.productId, jobToProcess.amount, jobToProcess.bidderId);
          } catch (autoBidError) {
            log.error({ err: autoBidError, productId: jobToProcess.productId }, 'Auto-bid processing error (non-fatal)');
            Sentry.captureException(autoBidError, { level: 'warning', tags: { route: 'worker.processAutoBids.trigger' }, extra: { productId: jobToProcess.productId } });
          }
        } else {
          // Check if it's a transient error (not a validation error)
          const isValidationError = [
            'Product not found',
            'Product is ',
            'Product is not active',
            'Auction has ended',
            'Bid must be at least',
            'Invalid bid amount',
          ].some((msg) => bidResult.error?.includes(msg));

          if (isValidationError) {
            // Remove from pending - it's a valid rejection
            await removePendingBidFromDb(jobToProcess.jobId!);
            await publishBidResult(jobToProcess.productId, {
              ...bidResult,
              amount: jobToProcess.amount,
              bidderId: jobToProcess.bidderId,
            });
            log.info({ jobId: jobToProcess.jobId, reason: bidResult.error }, 'Bid rejected');
          } else {
            // Transient error - retry
            const retryCount = (jobToProcess.retryCount || 0) + 1;

            if (retryCount < MAX_RETRIES) {
              jobToProcess.retryCount = retryCount;
              log.info({ jobId: jobToProcess.jobId, attempt: retryCount, maxRetries: MAX_RETRIES }, 'Retrying bid');
              await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * retryCount));
              await redisQueue.rpush(QUEUE_KEY, JSON.stringify(jobToProcess));
            } else {
              log.error({ jobId: jobToProcess.jobId, maxRetries: MAX_RETRIES }, 'Bid failed after max retries');
              await moveToFailedQueue(jobToProcess, bidResult.error || 'Unknown error');
              await removePendingBidFromDb(jobToProcess.jobId!);
              await publishBidResult(jobToProcess.productId, {
                success: false,
                error: 'Bid processing failed. Please try again.',
                amount: jobToProcess.amount,
                bidderId: jobToProcess.bidderId,
              });
            }
          }
        }
      }
    } catch (error) {
      log.error({ err: error }, 'Error in worker loop');
      Sentry.captureException(error, { tags: { route: 'worker.mainLoop' } });
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Graceful shutdown
async function shutdown() {
  log.info('Shutting down');

  try {
    if (redisQueue) await redisQueue.quit();
    if (redisPub) await redisPub.quit();
    await pool.end();
  } catch (error) {
    log.error({ err: error }, 'Error during shutdown');
  }

  await Sentry.flush(2000);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the worker
runWorker().catch(async (error) => {
  log.fatal({ err: error }, 'Fatal error');
  Sentry.captureException(error);
  await Sentry.flush(2000);
  process.exit(1);
});
