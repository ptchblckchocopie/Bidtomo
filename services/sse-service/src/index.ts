import './instrument';
import * as Sentry from '@sentry/node';
import express, { Request, Response } from 'express';
import cors from 'cors';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Validate critical env vars at startup
if (!process.env.PAYLOAD_SECRET) {
  console.error('FATAL: PAYLOAD_SECRET is not set. SSE service cannot verify JWT tokens. Exiting.');
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || process.env.SSE_PORT || '3002', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PREFIX = process.env.REDIS_PREFIX || '';
const CORS_ORIGIN = process.env.SSE_CORS_ORIGIN || 'http://localhost:5173';

// Payload v2 hashes the secret with SHA-256 before signing JWTs
const JWT_SECRET = crypto.createHash('sha256').update(process.env.PAYLOAD_SECRET).digest('hex').slice(0, 32);

// Connection managers
const productConnections = new Map<string, Set<Response>>();
const userConnections = new Map<string, Set<Response>>();
const globalConnections = new Set<Response>();

// Redis state
let redis: Redis;
let redisConnected = false;
let reconnectAttempts = 0;

// Initialize Redis with reconnection logic
function initRedis(): Redis {
  const client = new Redis(REDIS_URL, {
    retryStrategy: (times) => {
      reconnectAttempts = times;
      const delay = Math.min(times * 500, 5000);
      console.log(`[SSE] Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: null,
  });

  client.on('connect', () => {
    console.log('[SSE] Redis connected');
    redisConnected = true;
    reconnectAttempts = 0;
  });

  client.on('error', (err) => {
    console.error('[SSE] Redis error:', err.message);
    redisConnected = false;
  });

  client.on('close', () => {
    console.log('[SSE] Redis disconnected');
    redisConnected = false;
  });

  client.on('reconnecting', () => {
    console.log('[SSE] Redis reconnecting...');
  });

  return client;
}

// CORS configuration - allow local network IPs and configured origins
const ALLOWED_ORIGINS = (process.env.SSE_CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// SSE connection limits
const connectionCountByIp = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 20;
const MAX_GLOBAL_CONNECTIONS = 10000;
let globalConnectionCount = 0;

// Rate limiting for failed auth attempts (per IP)
const authFailures = new Map<string, { count: number; resetAt: number }>();
const AUTH_FAIL_MAX = 10;         // max failures before blocking
const AUTH_FAIL_WINDOW = 60_000;  // 1 minute window

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = authFailures.get(ip);
  if (!record || now > record.resetAt) {
    return true; // no record or window expired — allow
  }
  return record.count < AUTH_FAIL_MAX;
}

function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const record = authFailures.get(ip);
  if (!record || now > record.resetAt) {
    authFailures.set(ip, { count: 1, resetAt: now + AUTH_FAIL_WINDOW });
  } else {
    record.count++;
  }
}

// Connection lifetime limits
const MAX_CONNECTION_AGE_MS = 60 * 60 * 1000; // 1 hour max per connection

app.use(cors({
  origin: (origin, callback) => {
    // Reject requests with no origin in production (browser requests always have one)
    if (!origin) {
      const isProduction = process.env.NODE_ENV === 'production';
      return callback(null, !isProduction); // allow in dev, reject in prod
    }
    // Allow any localhost port in dev
    if (/^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    if (origin.match(/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/)) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.some(allowed => origin === allowed)) {
      return callback(null, true);
    }
    if (origin === 'https://bidmo.to' || origin === 'https://www.bidmo.to' || origin === 'https://app.bidmo.to') {
      return callback(null, true);
    }
    // Allow only our Vercel deployments (not any *.vercel.app)
    if (origin.startsWith('https://') && (
      origin === 'https://bidtomo.vercel.app' ||
      origin.startsWith('https://bidtomo-') && origin.endsWith('.vercel.app')
    )) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Health check endpoint
// Lightweight ping for uptime monitors
app.get('/ping', (_req, res) => {
  res.status(redisConnected ? 200 : 503).json({ status: redisConnected ? 'ok' : 'down', ts: Date.now() });
});

app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: redisConnected ? 'ok' : 'degraded',
    globalConnectionCount,
    maxGlobalConnections: MAX_GLOBAL_CONNECTIONS,
    productChannels: productConnections.size,
    userChannels: userConnections.size,
    globalClients: globalConnections.size,
    redis: redisConnected ? 'connected' : 'disconnected',
    reconnectAttempts,
    memoryMB: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: Date.now(),
  });
});

// Notify all clients about Redis status
function broadcastRedisStatus(connected: boolean) {
  const message = `data: ${JSON.stringify({ type: 'redis_status', connected })}\n\n`;

  productConnections.forEach((connections) => {
    connections.forEach((res) => {
      try { res.write(message); } catch { /* closed */ }
    });
  });

  userConnections.forEach((connections) => {
    connections.forEach((res) => {
      try { res.write(message); } catch { /* closed */ }
    });
  });

  globalConnections.forEach((res) => {
    try { res.write(message); } catch { /* closed */ }
  });
}

// SSE endpoint for product updates (bids)
app.get('/events/products/:productId', (req: Request, res: Response) => {
  const productId = req.params.productId;

  // Validate productId is a positive integer
  if (!/^\d+$/.test(productId) || parseInt(productId, 10) <= 0) {
    res.status(400).json({ error: 'Invalid product ID' });
    return;
  }

  // Enforce global connection cap
  if (globalConnectionCount >= MAX_GLOBAL_CONNECTIONS) {
    res.status(503).json({ error: 'Server at capacity' });
    return;
  }

  // Enforce per-IP connection limit
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const currentCount = connectionCountByIp.get(clientIp) || 0;
  if (currentCount >= MAX_CONNECTIONS_PER_IP) {
    res.status(429).json({ error: 'Too many SSE connections' });
    return;
  }
  connectionCountByIp.set(clientIp, currentCount + 1);
  globalConnectionCount++;

  // CORS is handled by middleware — do not manually reflect origin
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none');
  res.flushHeaders();

  // Tell browser to reconnect after 2s if connection drops
  res.write(`retry: 2000\n\n`);
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    productId,
    redis: redisConnected ? 'connected' : 'disconnected',
    fallbackPolling: !redisConnected
  })}\n\n`);

  if (!productConnections.has(productId)) {
    productConnections.set(productId, new Set());
  }
  productConnections.get(productId)!.add(res);
  console.log(`[SSE] Product ${productId} connected. Total: ${productConnections.get(productId)!.size}`);

  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat ${Date.now()}\n\n`); } catch { clearInterval(heartbeat); }
  }, 15000);

  // Max connection lifetime — force reconnect after 1 hour
  const maxLifetime = setTimeout(() => {
    try { res.end(); } catch { /* already closed */ }
  }, MAX_CONNECTION_AGE_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(maxLifetime);
    globalConnectionCount = Math.max(0, globalConnectionCount - 1);
    const connections = productConnections.get(productId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) productConnections.delete(productId);
      console.log(`[SSE] Product ${productId} disconnected. Remaining: ${connections.size}`);
    }
    // Decrement IP connection count
    const count = connectionCountByIp.get(clientIp) || 1;
    if (count <= 1) connectionCountByIp.delete(clientIp);
    else connectionCountByIp.set(clientIp, count - 1);
  });
});

// SSE endpoint for user updates (messages) — requires token auth
app.get('/events/users/:userId', (req: Request, res: Response) => {
  const userId = req.params.userId;
  const token = req.query.token as string;

  // Validate userId is a positive integer
  if (!/^\d+$/.test(userId) || parseInt(userId, 10) <= 0) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // Rate limit failed auth attempts per IP
  if (!checkAuthRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many authentication attempts' });
    return;
  }

  // Validate JWT token — user can only subscribe to their own events
  if (!token || !JWT_SECRET) {
    recordAuthFailure(clientIp);
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (String(decoded.id) !== String(userId)) {
      recordAuthFailure(clientIp);
      res.status(403).json({ error: 'Cannot subscribe to another user\'s events' });
      return;
    }
  } catch {
    recordAuthFailure(clientIp);
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Enforce global connection cap
  if (globalConnectionCount >= MAX_GLOBAL_CONNECTIONS) {
    res.status(503).json({ error: 'Server at capacity' });
    return;
  }

  // Enforce per-IP connection limit
  const currentCount = connectionCountByIp.get(clientIp) || 0;
  if (currentCount >= MAX_CONNECTIONS_PER_IP) {
    res.status(429).json({ error: 'Too many SSE connections' });
    return;
  }
  connectionCountByIp.set(clientIp, currentCount + 1);
  globalConnectionCount++;

  // CORS is handled by middleware — do not manually reflect origin
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none');
  res.flushHeaders();

  res.write(`retry: 2000\n\n`);
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    userId,
    redis: redisConnected ? 'connected' : 'disconnected'
  })}\n\n`);

  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId)!.add(res);
  console.log(`[SSE] User ${userId} connected. Total: ${userConnections.get(userId)!.size}`);

  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat ${Date.now()}\n\n`); } catch { clearInterval(heartbeat); }
  }, 15000);

  // Max connection lifetime — force reconnect after 1 hour
  const maxLifetime = setTimeout(() => {
    try { res.end(); } catch { /* already closed */ }
  }, MAX_CONNECTION_AGE_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(maxLifetime);
    globalConnectionCount = Math.max(0, globalConnectionCount - 1);
    const connections = userConnections.get(userId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) userConnections.delete(userId);
      console.log(`[SSE] User ${userId} disconnected. Remaining: ${connections.size}`);
    }
    // Decrement IP connection count
    const count = connectionCountByIp.get(clientIp) || 1;
    if (count <= 1) connectionCountByIp.delete(clientIp);
    else connectionCountByIp.set(clientIp, count - 1);
  });
});

// SSE endpoint for global updates (new products, bid updates across all products)
app.get('/events/global', (req: Request, res: Response) => {
  // Enforce global connection cap
  if (globalConnectionCount >= MAX_GLOBAL_CONNECTIONS) {
    res.status(503).json({ error: 'Server at capacity' });
    return;
  }

  // Enforce per-IP connection limit
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const currentCount = connectionCountByIp.get(clientIp) || 0;
  if (currentCount >= MAX_CONNECTIONS_PER_IP) {
    res.status(429).json({ error: 'Too many SSE connections' });
    return;
  }
  connectionCountByIp.set(clientIp, currentCount + 1);
  globalConnectionCount++;

  // CORS is handled by middleware — do not manually reflect origin
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none');
  res.flushHeaders();

  res.write(`retry: 2000\n\n`);
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    channel: 'global',
    redis: redisConnected ? 'connected' : 'disconnected'
  })}\n\n`);

  globalConnections.add(res);
  console.log(`[SSE] Global client connected. Total: ${globalConnections.size}`);

  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat ${Date.now()}\n\n`); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    globalConnectionCount = Math.max(0, globalConnectionCount - 1);
    globalConnections.delete(res);
    console.log(`[SSE] Global client disconnected. Remaining: ${globalConnections.size}`);
    // Decrement IP connection count
    const count = connectionCountByIp.get(clientIp) || 1;
    if (count <= 1) connectionCountByIp.delete(clientIp);
    else connectionCountByIp.set(clientIp, count - 1);
  });
});

// Broadcast to all global subscribers
function broadcastToGlobal(data: object) {
  if (globalConnections.size === 0) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  let sent = 0;

  globalConnections.forEach((res) => {
    try {
      res.write(message);
      if (typeof (res as any).flush === 'function') (res as any).flush();
      sent++;
    } catch {
      globalConnections.delete(res);
    }
  });

  console.log(`[SSE] Broadcast to global: ${sent} clients, type: ${(data as any).type}`);
}

// Broadcast to product subscribers
function broadcastToProduct(productId: string, data: object) {
  const connections = productConnections.get(productId);
  if (!connections || connections.size === 0) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  let sent = 0;

  connections.forEach((res) => {
    try {
      res.write(message);
      if (typeof (res as any).flush === 'function') (res as any).flush();
      sent++;
    } catch {
      connections.delete(res);
    }
  });

  console.log(`[SSE] Broadcast to product ${productId}: ${sent} clients`);
}

// Broadcast to user subscribers
function broadcastToUser(userId: string, data: object) {
  const connections = userConnections.get(userId);
  if (!connections || connections.size === 0) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  let sent = 0;

  connections.forEach((res) => {
    try {
      res.write(message);
      if (typeof (res as any).flush === 'function') (res as any).flush();
      sent++;
    } catch {
      connections.delete(res);
    }
  });

  console.log(`[SSE] Broadcast to user ${userId}: ${sent} clients`);
}

// Subscribe to Redis channels (with environment prefix support)
async function setupRedisSubscriber() {
  const productPattern = `${REDIS_PREFIX}sse:product:*`;
  const userPattern = `${REDIS_PREFIX}sse:user:*`;
  const globalChannel = `${REDIS_PREFIX}sse:global`;
  const productChannelPrefix = `${REDIS_PREFIX}sse:product:`;
  const userChannelPrefix = `${REDIS_PREFIX}sse:user:`;

  try {
    try {
      await redis.punsubscribe(productPattern, userPattern, globalChannel);
    } catch {
      // Ignore errors if not previously subscribed
    }

    await redis.psubscribe(productPattern, userPattern, globalChannel);

    redis.removeAllListeners('pmessage');

    redis.on('pmessage', (_pattern, channel, message) => {
      console.log(`[SSE] Redis pmessage received on channel: ${channel}`);
      try {
        const data = JSON.parse(message);

        if (channel === globalChannel) {
          broadcastToGlobal(data);
        } else if (channel.startsWith(productChannelPrefix)) {
          const productId = channel.slice(productChannelPrefix.length);
          broadcastToProduct(productId, data);

          // Also forward bid and accepted events to global subscribers
          // so the products grid updates in real-time
          if (data.type === 'bid' || data.type === 'accepted') {
            broadcastToGlobal({ ...data, productId: parseInt(productId, 10) });
          }
        } else if (channel.startsWith(userChannelPrefix)) {
          const userId = channel.slice(userChannelPrefix.length);
          broadcastToUser(userId, data);
        }
      } catch (error) {
        console.error('[SSE] Error processing Redis message:', error);
        Sentry.captureException(error, { tags: { route: 'sse.pmessage' }, extra: { channel } });
      }
    });

    console.log('[SSE] Redis subscriber ready');
  } catch (error) {
    console.error('[SSE] Failed to subscribe to Redis:', error);
    Sentry.captureException(error, { tags: { route: 'sse.setupRedisSubscriber' } });
    setTimeout(setupRedisSubscriber, 5000);
  }
}

// Watch Redis connection status
function watchRedisConnection() {
  let wasConnected = redisConnected;

  setInterval(() => {
    if (wasConnected !== redisConnected) {
      wasConnected = redisConnected;
      broadcastRedisStatus(redisConnected);

      if (redisConnected) {
        setupRedisSubscriber();
      }
    }
  }, 1000);
}

// Start server
async function start() {
  try {
    redis = initRedis();

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[SSE] Redis initial connection timeout, starting anyway...');
        resolve();
      }, 5000);

      redis.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    if (redisConnected) {
      await setupRedisSubscriber();
    }

    watchRedisConnection();

    // Dead connection sweep — prune connections where the socket died without 'close' event
    setInterval(() => {
      let pruned = 0;

      for (const [key, clients] of productConnections) {
        for (const res of clients) {
          if (res.writableEnded || res.destroyed) {
            clients.delete(res);
            globalConnectionCount = Math.max(0, globalConnectionCount - 1);
            pruned++;
          }
        }
        if (clients.size === 0) productConnections.delete(key);
      }

      for (const [key, clients] of userConnections) {
        for (const res of clients) {
          if (res.writableEnded || res.destroyed) {
            clients.delete(res);
            globalConnectionCount = Math.max(0, globalConnectionCount - 1);
            pruned++;
          }
        }
        if (clients.size === 0) userConnections.delete(key);
      }

      for (const res of globalConnections) {
        if (res.writableEnded || res.destroyed) {
          globalConnections.delete(res);
          globalConnectionCount = Math.max(0, globalConnectionCount - 1);
          pruned++;
        }
      }

      if (pruned > 0) {
        console.log(`[SSE] Pruned ${pruned} dead connection(s). Global: ${globalConnectionCount}`);
      }

      // Clean up expired auth failure records
      const now = Date.now();
      for (const [ip, record] of authFailures) {
        if (now > record.resetAt) authFailures.delete(ip);
      }
    }, 30000);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SSE] Service listening on port ${PORT}`);
      console.log(`[SSE] CORS origin: ${CORS_ORIGIN}`);
      console.log(`[SSE] Redis: ${REDIS_URL}`);
      console.log(`[SSE] Redis status: ${redisConnected ? 'connected' : 'disconnected'}`);
      console.log(`[SSE] Max global connections: ${MAX_GLOBAL_CONNECTIONS}`);
    });
  } catch (error) {
    console.error('[SSE] Failed to start:', error);
    Sentry.captureException(error);
    await Sentry.flush(2000);
    process.exit(1);
  }
}

// Graceful shutdown
// Sentry Express error handler — must be after all routes
Sentry.setupExpressErrorHandler(app);

process.on('SIGTERM', async () => {
  console.log('[SSE] Shutting down...');
  if (redis) redis.quit();
  await Sentry.flush(2000);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SSE] Shutting down...');
  if (redis) redis.quit();
  await Sentry.flush(2000);
  process.exit(0);
});

start();
