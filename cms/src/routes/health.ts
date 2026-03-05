import { Router } from 'express';
import { isRedisConnected } from '../redis';
import { isElasticAvailable } from '../services/elasticSearch';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/api/health', async (req, res) => {
    const esAvailable = await isElasticAvailable();
    res.json({
      status: 'ok',
      redis: isRedisConnected() ? 'connected' : 'disconnected',
      elasticsearch: esAvailable ? 'connected' : 'disconnected',
      timestamp: Date.now(),
    });
  });

  return router;
}
