import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
const BID_QUEUE_KEY = 'bids:pending';

let redis: Redis | null = null;
let redisConnected = false;

// Initialize Redis with reconnection logic
function getRedis(): Redis {
  if (redis) return redis;

  redis = new Redis(REDIS_URL, {
    retryStrategy: (times) => {
      if (times > 3) {
        console.warn('[CMS] Redis unavailable, giving up. Bid queuing will use direct fallback.');
        return null;
      }
      const delay = Math.min(times * 500, 5000);
      console.log(`[CMS] Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redis.on('connect', () => {
    console.log('[CMS] Redis connected');
    redisConnected = true;
  });

  redis.on('error', (err) => {
    console.error('[CMS] Redis error:', err.message);
    redisConnected = false;
  });

  redis.on('close', () => {
    console.log('[CMS] Redis disconnected');
    redisConnected = false;
  });

  // Connect immediately
  redis.connect().catch((err) => {
    console.warn('[CMS] Redis initial connection failed:', err.message);
  });

  return redis;
}

// Check if Redis is connected
export function isRedisConnected(): boolean {
  return redisConnected;
}

// Generate unique job ID
function generateJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface BidJob {
  type?: 'bid' | 'accept_bid';
  productId: number;
  bidderId: number;
  amount: number;
  timestamp: number;
  censorName?: boolean;
  jobId: string;
  sellerId?: number;
}

// Queue a bid for processing
export async function queueBid(
  productId: number,
  bidderId: number,
  amount: number,
  censorName: boolean = false
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const client = getRedis();

    if (!redisConnected) {
      // Wait a bit for connection
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!redisConnected) {
        return { success: false, error: 'Redis not connected' };
      }
    }

    const job: BidJob = {
      productId,
      bidderId,
      amount,
      timestamp: Date.now(),
      censorName,
      jobId: generateJobId(),
    };

    await client.rpush(BID_QUEUE_KEY, JSON.stringify(job));
    console.log(`[CMS] Queued bid: ${job.jobId} for product ${productId}`);

    return { success: true, jobId: job.jobId };
  } catch (error) {
    console.error('[CMS] Failed to queue bid:', error);
    return { success: false, error: String(error) };
  }
}

// Queue an accept bid action for processing (prevents race conditions)
export async function queueAcceptBid(
  productId: number,
  sellerId: number,
  highestBidderId: number,
  amount: number
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const client = getRedis();

    if (!redisConnected) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!redisConnected) {
        return { success: false, error: 'Redis not connected' };
      }
    }

    const job: BidJob = {
      type: 'accept_bid',
      productId,
      sellerId,
      bidderId: highestBidderId,
      amount,
      timestamp: Date.now(),
      jobId: generateJobId(),
    };

    // Push to the same queue so it's processed in order with bids
    await client.rpush(BID_QUEUE_KEY, JSON.stringify(job));
    console.log(`[CMS] Queued accept_bid: ${job.jobId} for product ${productId}`);

    return { success: true, jobId: job.jobId };
  } catch (error) {
    console.error('[CMS] Failed to queue accept bid:', error);
    return { success: false, error: String(error) };
  }
}

// Publish message notification for SSE
export async function publishMessageNotification(
  userId: number,
  data: {
    type: string;
    messageId: number | string;
    productId: number | string;
    senderId: number | string;
    preview?: string;
    message?: {
      id: string | number;
      message: string;
      sender: { id: string | number; name?: string; email?: string };
      receiver: { id: string | number };
      product: { id: string | number };
      read: boolean;
      createdAt: string;
      updatedAt: string;
    };
  }
): Promise<boolean> {
  try {
    const client = getRedis();

    if (!redisConnected) {
      console.warn('[CMS] Redis not connected, cannot publish message notification');
      return false;
    }

    const channel = `sse:user:${userId}`;
    const message = JSON.stringify({
      ...data,
      timestamp: Date.now(),
    });

    console.log(`[CMS] Publishing to Redis channel: ${channel}, type: ${data.type}`);
    const subscriberCount = await client.publish(channel, message);
    console.log(`[CMS] Published message notification to user ${userId}, subscribers: ${subscriberCount}`);

    return true;
  } catch (error) {
    console.error('[CMS] Failed to publish message notification:', error);
    return false;
  }
}

// Publish product update for SSE (when product status changes, etc.)
export async function publishProductUpdate(
  productId: number,
  data: {
    type: string;
    status?: string;
    currentBid?: number;
    [key: string]: any;
  }
): Promise<boolean> {
  try {
    const client = getRedis();

    if (!redisConnected) {
      console.warn('[CMS] Redis not connected, cannot publish product update');
      return false;
    }

    const channel = `sse:product:${productId}`;
    const message = JSON.stringify({
      ...data,
      timestamp: Date.now(),
    });

    await client.publish(channel, message);
    console.log(`[CMS] Published product update for product ${productId}`);

    return true;
  } catch (error) {
    console.error('[CMS] Failed to publish product update:', error);
    return false;
  }
}

// Publish typing status for SSE (real-time typing indicator)
export async function publishTypingStatus(
  productId: number,
  userId: number,
  isTyping: boolean
): Promise<boolean> {
  try {
    const client = getRedis();

    if (!redisConnected) {
      console.warn('[CMS] Redis not connected, cannot publish typing status');
      return false;
    }

    const channel = `sse:product:${productId}`;
    const message = JSON.stringify({
      type: 'typing',
      productId,
      userId,
      isTyping,
      timestamp: Date.now(),
    });

    await client.publish(channel, message);
    return true;
  } catch (error) {
    console.error('[CMS] Failed to publish typing status:', error);
    return false;
  }
}

// Publish global event for SSE (new products, system-wide updates)
export async function publishGlobalEvent(
  data: {
    type: string;
    [key: string]: any;
  }
): Promise<boolean> {
  try {
    const client = getRedis();

    if (!redisConnected) {
      console.warn('[CMS] Redis not connected, cannot publish global event');
      return false;
    }

    const channel = 'sse:global';
    const message = JSON.stringify({
      ...data,
      timestamp: Date.now(),
    });

    await client.publish(channel, message);
    console.log(`[CMS] Published global event: ${data.type}`);

    return true;
  } catch (error) {
    console.error('[CMS] Failed to publish global event:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    redisConnected = false;
  }
}

// Initialize on import
getRedis();
