import Redis from 'ioredis';
import { Pool } from 'pg';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/marketplace';
const QUEUE_KEY = 'bids:pending';
const FAILED_QUEUE_KEY = 'bids:failed';
const PROCESSING_KEY = 'bids:processing';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Redis clients (separate for blocking operations)
let redisQueue: Redis;
let redisPub: Redis;
let redisConnected = false;

// PostgreSQL pool
const pool = new Pool({
  connectionString: DATABASE_URL,
});

interface BidJob {
  productId: number;
  bidderId: number;
  amount: number;
  timestamp: number;
  censorName?: boolean;
  retryCount?: number;
  jobId?: string;
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
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Initialize Redis with retry logic
async function initRedis(): Promise<void> {
  return new Promise((resolve, reject) => {
    redisQueue = new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 500, 5000);
        console.log(`[WORKER] Redis reconnecting in ${delay}ms (attempt ${times})`);
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
      console.log('[WORKER] Redis queue connected');
      redisConnected = true;
    });

    redisQueue.on('error', (err) => {
      console.error('[WORKER] Redis queue error:', err.message);
      redisConnected = false;
    });

    redisQueue.on('close', () => {
      console.log('[WORKER] Redis queue disconnected');
      redisConnected = false;
    });

    redisPub.on('error', (err) => {
      console.error('[WORKER] Redis pub error:', err.message);
    });

    // Wait for connection
    redisQueue.once('ready', () => {
      resolve();
    });

    setTimeout(() => {
      if (!redisConnected) {
        console.warn('[WORKER] Redis connection timeout, will retry...');
        resolve(); // Continue anyway, Redis has retry logic
      }
    }, 5000);
  });
}

// Save failed bid to database for recovery
async function savePendingBidToDb(job: BidJob): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO pending_bids (product_id, bidder_id, amount, timestamp, censor_name, job_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (job_id) DO NOTHING`,
      [job.productId, job.bidderId, job.amount, new Date(job.timestamp), job.censorName || false, job.jobId]
    );
    console.log(`[WORKER] Saved pending bid to database: ${job.jobId}`);
  } catch (error) {
    console.error('[WORKER] Failed to save pending bid to database:', error);
  }
}

// Remove processed bid from database
async function removePendingBidFromDb(jobId: string): Promise<void> {
  try {
    await pool.query('DELETE FROM pending_bids WHERE job_id = $1', [jobId]);
  } catch (error) {
    console.error('[WORKER] Failed to remove pending bid from database:', error);
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
      console.log('[WORKER] Creating pending_bids table...');
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
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('[WORKER] Created pending_bids table');
      return;
    }

    const result = await pool.query(
      `SELECT * FROM pending_bids ORDER BY created_at ASC`
    );

    if (result.rows.length > 0) {
      console.log(`[WORKER] Recovering ${result.rows.length} pending bids from database...`);

      for (const row of result.rows) {
        const job: BidJob = {
          productId: row.product_id,
          bidderId: row.bidder_id,
          amount: parseFloat(row.amount),
          timestamp: new Date(row.timestamp).getTime(),
          censorName: row.censor_name,
          retryCount: row.retry_count || 0,
          jobId: row.job_id,
        };

        // Re-queue the job
        if (redisConnected) {
          await redisQueue.rpush(QUEUE_KEY, JSON.stringify(job));
          console.log(`[WORKER] Re-queued bid ${job.jobId}`);
        }
      }
    }
  } catch (error) {
    console.error('[WORKER] Failed to recover pending bids:', error);
  }
}

// Process a single bid
async function processBid(job: BidJob): Promise<{ success: boolean; error?: string; bidId?: number }> {
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

    // Validate bid amount
    const currentBid = product.currentBid || 0;
    const minimumBid = currentBid > 0
      ? currentBid + product.bidInterval
      : product.startingPrice;

    if (job.amount < minimumBid) {
      await client.query('ROLLBACK');
      return { success: false, error: `Bid must be at least ${minimumBid}` };
    }

    // Create the bid
    const bidResult = await client.query(
      `INSERT INTO bids (product, bidder, amount, bid_time, censor_name, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), $4, NOW(), NOW())
       RETURNING id`,
      [job.productId, job.bidderId, job.amount, job.censorName || false]
    );

    const bidId = bidResult.rows[0].id;

    // Update product's current bid
    await client.query(
      `UPDATE products SET current_bid = $1, updated_at = NOW() WHERE id = $2`,
      [job.amount, job.productId]
    );

    await client.query('COMMIT');

    console.log(`[WORKER] Bid ${bidId} processed: Product ${job.productId}, Amount ${job.amount}`);

    return { success: true, bidId };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[WORKER] Error processing bid:', error);
    return { success: false, error: String(error) };
  } finally {
    client.release();
  }
}

// Publish bid result to SSE service via Redis
async function publishBidResult(productId: number, result: { success: boolean; bidId?: number; amount?: number; bidderId?: number; error?: string }) {
  if (!redisConnected) {
    console.warn('[WORKER] Redis not connected, cannot publish result');
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
    console.log(`[WORKER] Published to ${channel}`);
  } catch (error) {
    console.error('[WORKER] Failed to publish bid result:', error);
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
    console.log(`[WORKER] Moved job ${job.jobId} to failed queue`);
  } catch (err) {
    console.error('[WORKER] Failed to move to failed queue:', err);
  }
}

// Main worker loop
async function runWorker() {
  console.log('[WORKER] Bid worker starting...');
  console.log(`[WORKER] Redis: ${REDIS_URL}`);
  console.log(`[WORKER] Database: ${DATABASE_URL.replace(/:[^@]+@/, ':***@')}`);
  console.log(`[WORKER] Queue: ${QUEUE_KEY}`);

  // Initialize Redis
  await initRedis();

  // Recover any pending bids from previous crash
  await recoverPendingBids();

  console.log('[WORKER] Bid worker started');

  while (true) {
    try {
      if (!redisConnected) {
        console.log('[WORKER] Waiting for Redis connection...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Blocking pop - wait for new jobs (timeout 5 seconds to check connection status)
      const result = await redisQueue.blpop(QUEUE_KEY, 5);

      if (!result) continue;

      const [, jobData] = result;
      const job: BidJob = JSON.parse(jobData);

      // Ensure job has an ID
      if (!job.jobId) {
        job.jobId = generateJobId();
      }

      console.log(`[WORKER] Processing bid: Product ${job.productId}, Amount ${job.amount}, Job ${job.jobId}`);

      // Save to database in case of crash
      await savePendingBidToDb(job);

      const bidResult = await processBid(job);

      if (bidResult.success) {
        // Remove from pending bids
        await removePendingBidFromDb(job.jobId);

        // Publish result to SSE
        await publishBidResult(job.productId, {
          ...bidResult,
          amount: job.amount,
          bidderId: job.bidderId,
        });
      } else {
        // Check if it's a transient error (not a validation error)
        const isValidationError = [
          'Product not found',
          'Product is sold',
          'Product is ended',
          'Product is not active',
          'Auction has ended',
          'Bid must be at least',
        ].some((msg) => bidResult.error?.includes(msg));

        if (isValidationError) {
          // Remove from pending - it's a valid rejection
          await removePendingBidFromDb(job.jobId);
          await publishBidResult(job.productId, {
            ...bidResult,
            amount: job.amount,
            bidderId: job.bidderId,
          });
          console.log(`[WORKER] Bid rejected: ${bidResult.error}`);
        } else {
          // Transient error - retry
          const retryCount = (job.retryCount || 0) + 1;

          if (retryCount < MAX_RETRIES) {
            job.retryCount = retryCount;
            console.log(`[WORKER] Retrying bid ${job.jobId} (attempt ${retryCount}/${MAX_RETRIES})`);
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * retryCount));
            await redisQueue.rpush(QUEUE_KEY, JSON.stringify(job));
          } else {
            console.error(`[WORKER] Bid ${job.jobId} failed after ${MAX_RETRIES} retries`);
            await moveToFailedQueue(job, bidResult.error || 'Unknown error');
            await removePendingBidFromDb(job.jobId);
            await publishBidResult(job.productId, {
              success: false,
              error: 'Bid processing failed. Please try again.',
              amount: job.amount,
              bidderId: job.bidderId,
            });
          }
        }
      }
    } catch (error) {
      console.error('[WORKER] Error in worker loop:', error);
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('[WORKER] Shutting down...');

  try {
    if (redisQueue) await redisQueue.quit();
    if (redisPub) await redisPub.quit();
    await pool.end();
  } catch (error) {
    console.error('[WORKER] Error during shutdown:', error);
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the worker
runWorker().catch((error) => {
  console.error('[WORKER] Fatal error:', error);
  process.exit(1);
});
