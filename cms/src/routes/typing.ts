import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { validate, typingSchema } from '../middleware/validate';
import { publishTypingStatus } from '../redis';

const isProduction = process.env.NODE_ENV === 'production';

// In-memory typing status store
// Structure: { 'productId:userId': timestamp }
const typingStatus = new Map<string, number>();
const TYPING_TIMEOUT = 3000; // 3 seconds

export function createTypingRouter(): Router {
  const router = Router();

  // Set typing status
  router.post('/api/typing', requireAuth, validate(typingSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { product, isTyping } = req.body;

      const key = `${product}:${userId}`;
      const productId = typeof product === 'string' ? parseInt(product, 10) : product;

      if (isTyping) {
        typingStatus.set(key, Date.now());
      } else {
        typingStatus.delete(key);
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

      const now = Date.now();
      const typingUsers: string[] = [];

      // Clean up expired typing statuses and find active ones
      for (const [key, timestamp] of typingStatus.entries()) {
        if (now - timestamp > TYPING_TIMEOUT) {
          typingStatus.delete(key);
        } else if (key.startsWith(`${productId}:`)) {
          const userId = key.split(':')[1];
          if (userId !== currentUserId) {
            typingUsers.push(userId);
          }
        }
      }

      res.json({ typing: typingUsers.length > 0, users: typingUsers });
    } catch (error: any) {
      console.error('Error getting typing status:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
