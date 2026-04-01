/**
 * Redis cache wrapper for product queries.
 * Reduces database load by caching product list/detail responses.
 *
 * Cache keys:
 *   products:list:{queryHash}   — TTL 10s (browse page, search results)
 *   products:detail:{id}        — TTL 5s  (product detail page)
 *
 * Invalidation:
 *   Called on bid placement (bid-worker), product update (Payload hooks),
 *   and auction close. Uses pattern-based invalidation for list caches.
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

  try {
    await redis.setex(fullKey, ttlSeconds, JSON.stringify(data));
  } catch {
    // Redis write failed — data is still returned from fetcher
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

    // Invalidate specific product detail
    if (productId) {
      pipeline.del(`${KEY_PREFIX}products:detail:${productId}`);
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
