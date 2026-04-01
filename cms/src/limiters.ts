import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';

const isProduction = process.env.NODE_ENV === 'production';
const UNLIMITED = 999999;

// Create Redis-backed store if Redis is available, otherwise fall back to in-memory
let redisStore: (() => RedisStore) | undefined;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

try {
  const redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  redisClient.connect().then(() => {
    console.log('[Rate Limiter] Connected to Redis — using distributed rate limiting');
    redisStore = () => new RedisStore({
      // @ts-expect-error - ioredis sendCommand is compatible
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: 'rl:',
    });
  }).catch(() => {
    console.warn('[Rate Limiter] Redis unavailable — falling back to in-memory rate limiting');
  });
} catch {
  console.warn('[Rate Limiter] Redis unavailable — falling back to in-memory rate limiting');
}

function createLimiter(opts: Partial<Options>) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    ...(redisStore ? { store: redisStore() } : {}),
    ...opts,
  });
}

export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : UNLIMITED,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

export const registrationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 5 : UNLIMITED,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

export const bidLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: isProduction ? 30 : UNLIMITED,
  message: { error: 'Too many bid attempts. Please slow down.' },
});

export const analyticsLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: isProduction ? 120 : UNLIMITED,
  message: { error: 'Too many analytics requests.' },
});

export const reportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 5 : UNLIMITED,
  message: { error: 'Too many reports. Please try again later.' },
});

export const analyticsDashboardLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: isProduction ? 10 : UNLIMITED,
  message: { error: 'Too many analytics dashboard requests.' },
});
