/**
 * Redis cache wrapper — Redis-first read layer with freshness guarantees.
 *
 * Strategy:
 *   - Write-through: bid-worker writes fresh product state to Redis after DB commit
 *   - Read-through: CMS checks Redis first, falls through to DB on miss
 *   - Invalidation: pub/sub channels for products, conversations, bids, users
 *   - TTL safety net: all cache entries expire even if invalidation fails
 *
 * Cache keys:
 *   products:list:{queryHash}        — TTL 10s (browse page, search results)
 *   products:detail:{id}             — TTL 5s  (product detail page)
 *   products:state:{id}              — TTL 30s (write-through hot fields from bid-worker)
 *   conversations:{userId}           — TTL 15s (inbox conversations list)
 *   productbids:{productId}          — TTL 10s (bid history for a product)
 *   productstatus:{productId}        — TTL 10s (lightweight status check)
 *   users:profile:{userId}           — TTL 30s (public profile)
 *   users:products:{userId}:{hash}   — TTL 15s (seller's product list)
 *   analytics:{queryHash}            — TTL 60s (admin dashboard)
 *
 * Invalidation channels:
 *   cache:invalidate                 — { productId } — products detail + list
 *   cache:invalidate:conversations   — { userId }    — user's conversation cache
 *   cache:invalidate:bids            — { productId } — product's bid history
 *   cache:invalidate:users           — { userId }    — user profile + product caches
 */

import crypto from 'crypto';
import { getRedisClient, isRedisConnected, REDIS_PREFIX } from '../redis';

const LIST_TTL = 10;   // seconds
const DETAIL_TTL = 5;  // seconds
const KEY_PREFIX = `${REDIS_PREFIX}cache:`;

/**
 * Get a cached value or fetch it from the source.
 * Falls through to the fetcher if Redis is unavailable.
 */
export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) {
    return fetcher();
  }

  const fullKey = KEY_PREFIX + key;

  try {
    const cached = await redis.get(fullKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Redis read failed — fall through to fetcher
  }

  const data = await fetcher();

  // Don't cache null/undefined results — prevents poisoning caches
  // with 404-like responses that block valid users on subsequent requests
  if (data != null) {
    try {
      await redis.setex(fullKey, ttlSeconds, JSON.stringify(data));
    } catch {
      // Redis write failed — data is still returned from fetcher
    }
  }

  return data;
}

/**
 * Cache a product detail response.
 */
export async function getCachedProductDetail<T>(
  productId: string | number,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getCached(`products:detail:${productId}`, DETAIL_TTL, fetcher);
}

/**
 * Cache a product list response.
 * Query params are hashed to create a unique key per query combination.
 */
export async function getCachedProductList<T>(
  queryParams: Record<string, any>,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(queryParams))
    .digest('hex')
    .slice(0, 12);
  return getCached(`products:list:${hash}`, LIST_TTL, fetcher);
}

/**
 * Invalidate cache for a specific product and all list caches.
 * Called after bid placement, product update, auction close, etc.
 */
export async function invalidateProductCache(productId?: string | number): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) return;

  try {
    const pipeline = redis.pipeline();

    // Invalidate specific product detail + write-through state + status cache
    if (productId) {
      pipeline.del(`${KEY_PREFIX}products:detail:${productId}`);
      pipeline.del(`${KEY_PREFIX}products:state:${productId}`);
      pipeline.del(`${KEY_PREFIX}productstatus:${productId}`);
    }

    // Invalidate all list caches using SCAN (non-blocking, unlike KEYS)
    const pattern = `${KEY_PREFIX}products:list:*`;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        pipeline.del(...keys);
      }
    } while (cursor !== '0');

    await pipeline.exec();
  } catch {
    // Cache invalidation is best-effort
  }
}

// ── Additional cache helpers for heavy endpoints ──

const ANALYTICS_TTL = 60;   // 1 minute — dashboard data changes slowly
const USER_PROFILE_TTL = 30; // 30 seconds — public profile viewed by many
const USER_PRODUCTS_TTL = 15; // 15 seconds — seller's product list

/**
 * Cache analytics dashboard response (expensive: 6 queries).
 */
export async function getCachedAnalytics<T>(
  queryHash: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getCached(`analytics:${queryHash}`, ANALYTICS_TTL, fetcher);
}

/**
 * Cache user public profile response.
 */
export async function getCachedUserProfile<T>(
  userId: string | number,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getCached(`users:profile:${userId}`, USER_PROFILE_TTL, fetcher);
}

/**
 * Cache user's product listings.
 */
export async function getCachedUserProducts<T>(
  userId: string | number,
  queryHash: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getCached(`users:products:${userId}:${queryHash}`, USER_PRODUCTS_TTL, fetcher);
}

/**
 * Invalidate user-related caches (after profile update, product change, etc.)
 */
export async function invalidateUserCache(userId: string | number): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) return;

  try {
    const pipeline = redis.pipeline();
    pipeline.del(`${KEY_PREFIX}users:profile:${userId}`);

    // Scan and delete user product caches
    const pattern = `${KEY_PREFIX}users:products:${userId}:*`;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 50);
      cursor = nextCursor;
      if (keys.length > 0) pipeline.del(...keys);
    } while (cursor !== '0');

    await pipeline.exec();
  } catch { /* best-effort */ }
}

/**
 * Invalidate analytics cache.
 */
export async function invalidateAnalyticsCache(): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) return;

  try {
    const pattern = `${KEY_PREFIX}analytics:*`;
    let cursor = '0';
    const pipeline = redis.pipeline();
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 50);
      cursor = nextCursor;
      if (keys.length > 0) pipeline.del(...keys);
    } while (cursor !== '0');
    await pipeline.exec();
  } catch { /* best-effort */ }
}

/**
 * Publish a cache invalidation event via Redis pub/sub.
 * Used by bid-worker to notify CMS to invalidate its cache.
 */
export async function publishCacheInvalidation(
  redis: any,
  productId: string | number,
): Promise<void> {
  try {
    await redis.publish(`${REDIS_PREFIX}cache:invalidate`, JSON.stringify({ productId }));
  } catch {
    // Best-effort
  }
}

// ── Write-through caching (called by bid-worker after DB commit) ──

const PRODUCT_STATE_TTL = 30;     // seconds — safety net; overwritten on every bid
const CONVERSATIONS_TTL = 15;     // seconds
const PRODUCT_BIDS_TTL = 10;      // seconds
const PRODUCT_STATUS_TTL = 10;    // seconds

/**
 * Product state written by bid-worker immediately after COMMIT.
 * Contains only the fast-changing fields so reads never see stale bid data.
 */
export interface ProductState {
  currentBid: number | null;
  status: string;
  auctionEndDate: string;
  active: boolean;
  _cachedAt: number; // Date.now() — freshness marker
}

/**
 * Write fresh product state to Redis (write-through from bid-worker).
 * Replaces the invalidate-and-wait pattern for hot product fields.
 */
export async function writeProductState(
  redis: any,
  productId: string | number,
  state: Omit<ProductState, '_cachedAt'>,
): Promise<void> {
  try {
    const entry: ProductState = { ...state, _cachedAt: Date.now() };
    await redis.setex(
      `${KEY_PREFIX}products:state:${productId}`,
      PRODUCT_STATE_TTL,
      JSON.stringify(entry),
    );
  } catch { /* best-effort */ }
}

/**
 * Read fresh product state from write-through cache.
 * Returns null on miss — caller should fall through to DB.
 */
export async function readProductState(productId: string | number): Promise<ProductState | null> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) return null;

  try {
    const raw = await redis.get(`${KEY_PREFIX}products:state:${productId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ProductState;
  } catch {
    return null;
  }
}

// ── Conversations cache ──

/**
 * Cache user's conversations list (expensive 7-JOIN query).
 */
export async function getCachedConversations<T>(
  userId: string | number,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getCached(`conversations:${userId}`, CONVERSATIONS_TTL, fetcher);
}

/**
 * Invalidate conversation cache for a specific user.
 */
export async function invalidateConversationCache(userId: string | number): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) return;

  try {
    await redis.del(`${KEY_PREFIX}conversations:${userId}`);
  } catch { /* best-effort */ }
}

// ── Product bids cache ──

/**
 * Cache bid history for a product.
 */
export async function getCachedProductBids<T>(
  productId: string | number,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getCached(`productbids:${productId}`, PRODUCT_BIDS_TTL, fetcher);
}

/**
 * Invalidate bid history cache for a product.
 */
export async function invalidateBidCache(productId: string | number): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) return;

  try {
    await redis.del(`${KEY_PREFIX}productbids:${productId}`);
  } catch { /* best-effort */ }
}

// ── Product status cache (lightweight check used by SSE fallback polling) ──

/**
 * Cache lightweight product status response.
 */
export async function getCachedProductStatus<T>(
  productId: string | number,
  fetcher: () => Promise<T>,
): Promise<T> {
  return getCached(`productstatus:${productId}`, PRODUCT_STATUS_TTL, fetcher);
}

/**
 * Invalidate product status cache.
 */
export async function invalidateProductStatusCache(productId: string | number): Promise<void> {
  const redis = getRedisClient();
  if (!redis || !isRedisConnected()) return;

  try {
    await redis.del(`${KEY_PREFIX}productstatus:${productId}`);
  } catch { /* best-effort */ }
}

// ── Invalidation channel constants (shared between CMS and bid-worker) ──

export const INVALIDATION_CHANNELS = {
  products: `${REDIS_PREFIX}cache:invalidate`,
  conversations: `${REDIS_PREFIX}cache:invalidate:conversations`,
  bids: `${REDIS_PREFIX}cache:invalidate:bids`,
  users: `${REDIS_PREFIX}cache:invalidate:users`,
} as const;
