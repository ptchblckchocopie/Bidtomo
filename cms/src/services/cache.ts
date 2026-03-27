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
import { getRedisClient, isRedisConnected } from '../redis';

const LIST_TTL = 10;   // seconds
const DETAIL_TTL = 5;  // seconds
const KEY_PREFIX = 'cache:';

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

    // Invalidate all list caches (pattern scan)
    const listKeys = await redis.keys(`${KEY_PREFIX}products:list:*`);
    if (listKeys.length > 0) {
      pipeline.del(...listKeys);
    }

    await pipeline.exec();
  } catch {
    // Cache invalidation is best-effort
  }
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
    await redis.publish('cache:invalidate', JSON.stringify({ productId }));
  } catch {
    // Best-effort
  }
}
