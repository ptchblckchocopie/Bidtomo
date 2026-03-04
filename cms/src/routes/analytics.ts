import { Router } from 'express';
import * as Sentry from '@sentry/node';
import jwt from 'jsonwebtoken';
import type { Payload } from 'payload';
import { requireAuth } from '../middleware/requireAuth';
import { getPayloadJwtSecret } from '../middleware/requireAuth';
import { validate, analyticsTrackSchema } from '../middleware/validate';
import { analyticsLimiter, analyticsDashboardLimiter } from '../limiters';
import { getOverviewStats, getTimeSeries, getTopSearchKeywords, getTopViewedProducts, getTopSoldProducts, getEventBreakdown } from '../services/analyticsQueries';

interface AnalyticsDeps {
  payload: Payload;
  isProduction: boolean;
}

/**
 * Creates the analytics track route. Registered BEFORE payload.init()
 * because it uses jwt.verify directly (no req.payload needed).
 */
export function createAnalyticsTrackRouter({ payload }: { payload: Payload }): Router {
  const router = Router();

  router.post('/api/analytics/track', analyticsLimiter, validate(analyticsTrackSchema), async (req, res) => {
    try {
      let userId: number | string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
        try {
          const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
          const decoded = jwt.verify(token, getPayloadJwtSecret()) as any;
          if (decoded.id) userId = decoded.id;
        } catch {
          // Anonymous is fine
        }
      }

      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const { events } = req.body;

      // Fire-and-forget: write events without blocking response
      setImmediate(async () => {
        for (const event of events) {
          try {
            await payload.create({
              collection: 'user-events',
              data: {
                eventType: event.eventType,
                user: (userId as any) || undefined,
                page: event.page,
                metadata: event.metadata,
                sessionId: event.sessionId,
                deviceInfo: event.deviceInfo,
                referrer: event.referrer,
                ip,
              },
              overrideAccess: true,
            });
          } catch (err: any) {
            console.error('[Analytics] Failed to write event:', err?.message || err);
          }
        }
      });

      res.json({ success: true });
    } catch {
      res.json({ success: true });
    }
  });

  return router;
}

/**
 * Creates the analytics dashboard route. Registered AFTER payload.init().
 */
export function createAnalyticsDashboardRouter({ payload, isProduction }: AnalyticsDeps): Router {
  const router = Router();

  router.get('/api/analytics/dashboard', analyticsDashboardLimiter, requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true });
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const now = new Date();
      const defaultFrom = new Date(now);
      defaultFrom.setDate(defaultFrom.getDate() - 30);

      let from = (req.query.from as string) || defaultFrom.toISOString();
      let to = (req.query.to as string) || now.toISOString();
      // If date-only string (YYYY-MM-DD), append end-of-day so today's events are included
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) to += 'T23:59:59.999Z';
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) from += 'T00:00:00.000Z';
      const range = { from, to };

      const pool = (payload.db as any).pool;

      const [overview, timeSeries, topSearchKeywords, topViewedProducts, topSoldProducts, eventBreakdown] = await Promise.all([
        getOverviewStats(pool, range),
        getTimeSeries(pool, range),
        getTopSearchKeywords(pool, range),
        getTopViewedProducts(pool, range),
        getTopSoldProducts(pool, range),
        getEventBreakdown(pool, range),
      ]);

      res.json({
        period: { from, to },
        overview,
        timeSeries,
        topSearchKeywords,
        topViewedProducts,
        topSoldProducts,
        eventBreakdown,
      });
    } catch (error: any) {
      console.error('Error fetching analytics dashboard:', error);
      Sentry.captureException(error, { tags: { route: '/api/analytics/dashboard' } });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
