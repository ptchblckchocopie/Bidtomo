import { Router } from 'express';
import * as Sentry from '@sentry/node';
import type { Payload } from 'payload';
import { requireAuth } from '../middleware/requireAuth';
import { authenticateJWT } from '../auth-helpers';
import { ensureProductIndex, searchProducts, bulkSyncProducts, isElasticAvailable } from '../services/elasticSearch';

interface SearchDeps {
  payload: Payload;
  isProduction: boolean;
}

export function createSearchRouter({ payload, isProduction }: SearchDeps): Router {
  const router = Router();

  // Elasticsearch: search products
  router.get('/api/search/products', async (req, res) => {
    try {
      const query = req.query.q as string || '';
      let status = req.query.status as string || 'available';
      const region = req.query.region as string || '';
      const city = req.query.city as string || '';
      const categoriesParam = req.query.categories as string || '';
      const categories = categoriesParam ? categoriesParam.split(',').filter(Boolean) : undefined;
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '12', 10);

      // Only admins can search hidden products
      if (status === 'hidden') {
        const user = await authenticateJWT(req);
        if (!user || (user as any).role !== 'admin') {
          status = 'available';
        }
      }

      const esAvailable = await isElasticAvailable();

      if (!esAvailable || !query.trim()) {
        return res.status(200).json({ fallback: true });
      }

      let esStatus: string | undefined;
      let esActive: boolean | undefined;
      if (status === 'hidden') {
        esActive = false;
      } else if (status === 'active') {
        esStatus = 'available';
        esActive = true;
      } else if (status === 'ended') {
        esStatus = 'ended';
      }

      const esResult = await searchProducts({
        query,
        status: esStatus,
        active: esActive,
        region: region || undefined,
        city: city || undefined,
        categories,
        page,
        limit,
      });

      if (esResult.ids.length === 0) {
        return res.json({
          docs: [],
          totalDocs: esResult.total,
          totalPages: Math.ceil(esResult.total / limit),
          page,
          limit,
        });
      }

      // Fetch full product docs from Payload by IDs (preserving ES sort order)
      const products = await payload.find({
        collection: 'products',
        where: { id: { in: esResult.ids.map(String) } },
        limit: esResult.ids.length,
        depth: 1,
      });

      // Preserve ES relevance ordering
      const productMap = new Map(products.docs.map((p: any) => [p.id, p]));
      const orderedDocs = esResult.ids
        .map(id => productMap.get(id))
        .filter(Boolean);

      res.json({
        docs: orderedDocs,
        totalDocs: esResult.total,
        totalPages: Math.ceil(esResult.total / limit),
        page,
        limit,
      });
    } catch (error: any) {
      console.error('Elasticsearch search error:', error);
      res.status(200).json({ fallback: true });
    }
  });

  // Elasticsearch: bulk sync all products (admin utility)
  router.post('/api/elasticsearch/sync', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const user = await payload.findByID({ collection: 'users', id: userId });
      if ((user as any).role !== 'admin') return res.status(403).json({ error: 'Admin only' });

      const esAvailable = await isElasticAvailable();
      if (!esAvailable) return res.status(503).json({ error: 'Elasticsearch not available' });

      await ensureProductIndex();
      const result = await bulkSyncProducts(payload);

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Elasticsearch sync error:', error);
      Sentry.captureException(error, { tags: { route: '/api/elasticsearch/sync' } });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
