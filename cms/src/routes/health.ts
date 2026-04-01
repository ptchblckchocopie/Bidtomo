import { Router } from 'express';
import { isRedisConnected, getRedisClient } from '../redis';
import { isElasticAvailable } from '../services/elasticSearch';
import { getLatestBackupAgeHours } from '../services/backupService';
import type { Payload } from 'payload';

export function createHealthRouter(payload?: Payload): Router {
  const router = Router();

  router.get('/api/health', async (req, res) => {
    const esAvailable = await isElasticAvailable();

    let postgres = 'disconnected';
    let pendingExpiredAuctions = 0;
    let emailQueueDepth = 0;
    let pendingBidsBacklog = 0;

    if (payload) {
      const pool = (payload.db as any).pool;

      // Postgres connectivity
      try {
        await pool.query('SELECT 1');
        postgres = 'connected';
      } catch { /* non-critical */ }

      // Pending expired auctions
      try {
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM products
           WHERE status = 'available' AND active = true AND auction_end_date < NOW()`
        );
        pendingExpiredAuctions = parseInt(result.rows[0].count, 10);
      } catch { /* non-critical */ }

      // Pending bids backlog
      try {
        const result = await pool.query(
          `SELECT COUNT(*) as count FROM pending_bids`
        );
        pendingBidsBacklog = parseInt(result.rows[0].count, 10);
      } catch { /* table may not exist */ }
    }

    // Email queue depth (via Redis)
    try {
      if (isRedisConnected()) {
        const redis = getRedisClient();
        if (redis) {
          emailQueueDepth = await redis.llen(`${process.env.REDIS_PREFIX || ''}email:queue`);
        }
      }
    } catch { /* non-critical */ }

    // Backup age check (>48h = degraded)
    let backupAgeHours: number | null = null;
    let backupStale = false;
    if (process.env.BACKUP_ENABLED === 'true') {
      try {
        backupAgeHours = await getLatestBackupAgeHours();
        backupStale = backupAgeHours === null || backupAgeHours > 48;
      } catch { /* non-critical */ }
    }

    const allOk = postgres === 'connected' && isRedisConnected() && !backupStale;

    res.json({
      status: allOk ? 'ok' : 'degraded',
      postgres,
      redis: isRedisConnected() ? 'connected' : 'disconnected',
      elasticsearch: esAvailable ? 'connected' : 'disconnected',
      pendingExpiredAuctions,
      emailQueueDepth,
      pendingBidsBacklog,
      ...(process.env.BACKUP_ENABLED === 'true' && {
        backupAgeHours: backupAgeHours !== null ? Math.round(backupAgeHours * 10) / 10 : null,
        backupStale,
      }),
      timestamp: Date.now(),
    });
  });

  return router;
}
