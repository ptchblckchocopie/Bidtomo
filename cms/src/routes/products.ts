import { Router } from 'express';
import type { Payload } from 'payload';
import { authenticateJWT } from '../auth-helpers';

interface ProductsDeps {
  payload: Payload;
  isProduction: boolean;
}

export function createProductsRouter({ payload, isProduction }: ProductsDeps): Router {
  const router = Router();

  // Endpoint to get product update status (lightweight check for changes)
  router.get('/api/products/:id/status', async (req, res) => {
    try {
      const productId = req.params.id;

      const product = await payload.findByID({
        collection: 'products',
        id: productId,
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Block hidden product status for non-admins (unless they're the seller)
      if (!product.active) {
        const user = await authenticateJWT(req);
        const sellerId = typeof product.seller === 'object' ? (product.seller as any).id : product.seller;
        if (!user || ((user as any).role !== 'admin' && (user as any).id !== sellerId)) {
          return res.status(404).json({ error: 'Product not found' });
        }
      }

      // Get the latest bid timestamp
      const latestBid = await payload.find({
        collection: 'bids',
        where: {
          product: {
            equals: productId,
          },
        },
        sort: '-bidTime',
        limit: 1,
      });

      const latestBidTime = latestBid.docs.length > 0 ? latestBid.docs[0].bidTime : null;

      res.json({
        id: product.id,
        updatedAt: product.updatedAt,
        status: product.status,
        currentBid: product.currentBid,
        latestBidTime,
        bidCount: latestBid.totalDocs,
      });
    } catch (error: any) {
      console.error('Error fetching product status:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
