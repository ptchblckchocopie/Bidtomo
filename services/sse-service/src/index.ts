import express, { Request, Response } from 'express';
import cors from 'cors';
import Redis from 'ioredis';

const app = express();
const PORT = parseInt(process.env.SSE_PORT || '3002', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
const CORS_ORIGIN = process.env.SSE_CORS_ORIGIN || 'http://localhost:5173';

// Connection managers
const productConnections = new Map<string, Set<Response>>();
const userConnections = new Map<string, Set<Response>>();

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

// CORS configuration - allow local network IPs for development
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Allow localhost
    if (origin.includes('localhost')) return callback(null, true);

    // Allow any local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (origin.match(/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/)) {
      return callback(null, true);
    }

    // Allow configured CORS_ORIGIN
    if (origin === CORS_ORIGIN) return callback(null, true);

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: redisConnected ? 'ok' : 'degraded',
    productConnections: productConnections.size,
    userConnections: userConnections.size,
    redis: redisConnected ? 'connected' : 'disconnected',
    reconnectAttempts,
  });
});

// Notify all clients about Redis status
function broadcastRedisStatus(connected: boolean) {
  const message = `data: ${JSON.stringify({ type: 'redis_status', connected })}\n\n`;

  productConnections.forEach((connections) => {
    connections.forEach((res) => {
      try {
        res.write(message);
      } catch (error) {
        // Connection already closed
      }
    });
  });

  userConnections.forEach((connections) => {
    connections.forEach((res) => {
      try {
        res.write(message);
      } catch (error) {
        // Connection already closed
      }
    });
  });
}

// SSE endpoint for product updates (bids)
app.get('/events/products/:productId', (req: Request, res: Response) => {
  const { productId } = req.params;
  const origin = req.headers.origin;

  // Set CORS headers for SSE
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none'); // Disable compression for SSE

  // Flush headers immediately
  res.flushHeaders();

  // Send initial connection event with Redis status
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    productId,
    redis: redisConnected ? 'connected' : 'disconnected',
    fallbackPolling: !redisConnected
  })}\n\n`);

  // Add to connections
  if (!productConnections.has(productId)) {
    productConnections.set(productId, new Set());
  }
  productConnections.get(productId)!.add(res);

  console.log(`[SSE] Product ${productId} connected. Total: ${productConnections.get(productId)!.size}`);

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    const connections = productConnections.get(productId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        productConnections.delete(productId);
      }
      console.log(`[SSE] Product ${productId} disconnected. Remaining: ${connections.size}`);
    }
  });
});

// SSE endpoint for user updates (messages)
app.get('/events/users/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  const origin = req.headers.origin;

  // Set CORS headers for SSE
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none'); // Disable compression for SSE

  // Flush headers immediately
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    userId,
    redis: redisConnected ? 'connected' : 'disconnected'
  })}\n\n`);

  // Add to connections
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId)!.add(res);

  console.log(`[SSE] User ${userId} connected. Total: ${userConnections.get(userId)!.size}`);

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    const connections = userConnections.get(userId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        userConnections.delete(userId);
      }
      console.log(`[SSE] User ${userId} disconnected. Remaining: ${connections.size}`);
    }
  });
});

// Broadcast to product subscribers
function broadcastToProduct(productId: string, data: object) {
  const connections = productConnections.get(productId);
  if (!connections || connections.size === 0) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  let sent = 0;

  connections.forEach((res) => {
    try {
      res.write(message);
      // Flush immediately to prevent buffering
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
      sent++;
    } catch (error) {
      console.error(`[SSE] Error broadcasting to product ${productId}:`, error);
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
      // Flush immediately to prevent buffering
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
      sent++;
    } catch (error) {
      console.error(`[SSE] Error broadcasting to user ${userId}:`, error);
      connections.delete(res);
    }
  });

  console.log(`[SSE] Broadcast to user ${userId}: ${sent} clients`);
}

// Subscribe to Redis channels
async function setupRedisSubscriber() {
  try {
    // Subscribe to pattern channels
    await redis.psubscribe('sse:product:*', 'sse:user:*');

    redis.on('pmessage', (pattern, channel, message) => {
      console.log(`[SSE] Redis pmessage received on channel: ${channel}`);
      try {
        const data = JSON.parse(message);

        if (channel.startsWith('sse:product:')) {
          const productId = channel.replace('sse:product:', '');
          console.log(`[SSE] Broadcasting to product ${productId}, data type: ${data.type}`);
          broadcastToProduct(productId, data);
        } else if (channel.startsWith('sse:user:')) {
          const userId = channel.replace('sse:user:', '');
          console.log(`[SSE] Broadcasting to user ${userId}, data type: ${data.type}, connected users: ${userConnections.has(userId) ? userConnections.get(userId)?.size : 0}`);
          broadcastToUser(userId, data);
        }
      } catch (error) {
        console.error('[SSE] Error processing Redis message:', error);
      }
    });

    console.log('[SSE] Redis subscriber ready');
  } catch (error) {
    console.error('[SSE] Failed to subscribe to Redis:', error);
    // Retry subscription after delay
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
        // Re-subscribe on reconnection
        setupRedisSubscriber();
      }
    }
  }, 1000);
}

// Start server
async function start() {
  try {
    // Initialize Redis
    redis = initRedis();

    // Wait for initial connection (with timeout)
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

    // Setup Redis subscriber if connected
    if (redisConnected) {
      await setupRedisSubscriber();
    }

    // Watch for reconnections
    watchRedisConnection();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SSE] Service listening on port ${PORT}`);
      console.log(`[SSE] CORS origin: ${CORS_ORIGIN}`);
      console.log(`[SSE] Redis: ${REDIS_URL}`);
      console.log(`[SSE] Redis status: ${redisConnected ? 'connected' : 'disconnected'}`);
    });
  } catch (error) {
    console.error('[SSE] Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SSE] Shutting down...');
  if (redis) redis.quit();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SSE] Shutting down...');
  if (redis) redis.quit();
  process.exit(0);
});

start();
