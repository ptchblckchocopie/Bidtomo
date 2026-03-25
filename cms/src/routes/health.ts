import { Router } from 'express';
import { isRedisConnected } from '../redis';
import { isElasticAvailable } from '../services/elasticSearch';
import type { Payload } from 'payload';

export function createHealthRouter(payload?: Payload): Router {
  const router = Router();

  router.get('/api/health', async (req, res) => {
    const esAvailable = await isElasticAvailable();

    let pendingExpiredAuctions = 0;
    if (payload) {
      try {
        const pool = (payload.db as any).pool;
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM products
           WHERE status = 'available' AND active = true AND auction_end_date < NOW()`
        );
        pendingExpiredAuctions = parseInt(result.rows[0].count, 10);
      } catch {
        // Non-critical — don't fail health check
      }
    }

    res.json({
      status: 'ok',
      redis: isRedisConnected() ? 'connected' : 'disconnected',
      elasticsearch: esAvailable ? 'connected' : 'disconnected',
      pendingExpiredAuctions,
      timestamp: Date.now(),
    });
  });

  return router;
}
