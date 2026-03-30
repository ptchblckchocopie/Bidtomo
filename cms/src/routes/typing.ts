import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { validate, typingSchema } from '../middleware/validate';
import { publishTypingStatus, getRedisClient, isRedisConnected } from '../redis';

const isProduction = process.env.NODE_ENV === 'production';

const TYPING_TTL = 5; // seconds — auto-expires if client stops sending
const TYPING_KEY_PREFIX = 'typing:';

export function createTypingRouter(): Router {
  const router = Router();

  // Set typing status
  router.post('/api/typing', requireAuth, validate(typingSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { product, isTyping } = req.body;

      const productId = typeof product === 'string' ? parseInt(product, 10) : product;
      const redis = getRedisClient();

      if (redis && isRedisConnected()) {
        const key = `${TYPING_KEY_PREFIX}${productId}:${userId}`;
        if (isTyping) {
          await redis.setex(key, TYPING_TTL, '1');
        } else {
          await redis.del(key);
        }
      }

      // Publish typing status via SSE for real-time updates
      await publishTypingStatus(productId, userId, isTyping);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error setting typing status:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Get typing status for a product
  router.get('/api/typing/:productId', requireAuth, async (req, res) => {
    try {
      const { productId } = req.params;
      const currentUserId = (req as any).userId;
      const redis = getRedisClient();

      const typingUsers: string[] = [];

      if (redis && isRedisConnected()) {
        // SCAN for all typing keys for this product
        const pattern = `${TYPING_KEY_PREFIX}${productId}:*`;
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 50);
          cursor = nextCursor;
          for (const key of keys) {
            // Extract userId from key: typing:productId:userId
            const userId = key.split(':').pop();
            if (userId && userId !== currentUserId) {
              typingUsers.push(userId);
            }
          }
        } while (cursor !== '0');
      }

      res.json({ typing: typingUsers.length > 0, users: typingUsers });
    } catch (error: any) {
      console.error('Error getting typing status:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
