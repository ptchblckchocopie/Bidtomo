import { Router } from 'express';
import * as Sentry from '@sentry/node';
import type { Payload } from 'payload';
import { requireAuth } from '../middleware/requireAuth';
import { validate, reportCreateSchema } from '../middleware/validate';
import { reportLimiter } from '../limiters';
import { authenticateJWT } from '../auth-helpers';
import { runBackup, cleanupOldBackups, isBackupInProgress } from '../services/backupService';

interface MiscDeps {
  payload: Payload;
  isProduction: boolean;
}

export function createMiscRouter({ payload, isProduction }: MiscDeps): Router {
  const router = Router();

  // Root route - API info
  router.get('/', (req, res) => {
    res.json({
      message: 'Marketplace CMS API',
      status: 'running',
      admin: '/admin',
      endpoints: {
        products: '/api/products',
        users: '/api/users',
        bids: '/api/bids',
        messages: '/api/messages',
        transactions: '/api/transactions',
      },
    });
  });

  // Manual backup trigger (admin-only)
  router.post('/api/backup/trigger', async (req, res) => {
    try {
      const user = await authenticateJWT(req);
      if (!user || (user as any).role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      if (isBackupInProgress()) {
        return res.status(409).json({ error: 'Backup already in progress' });
      }

      res.json({ message: 'Backup started' });

      const result = await runBackup();
      if (result.success) {
        await cleanupOldBackups();
      }
    } catch (error: any) {
      console.error('[BACKUP] Manual trigger failed:', error.message);
      Sentry.captureException(error, { tags: { route: '/api/backup/trigger' } });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Backup trigger failed' });
      }
    }
  });

  // Create conversations for sold products
  router.post('/api/create-conversations', async (req, res) => {
    try {
      const user = await authenticateJWT(req);
      if (!user || (user as any).role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      console.log('Starting conversation creation for sold products...');

      const soldProducts = await payload.find({
        collection: 'products',
        where: {
          status: {
            equals: 'sold',
          },
        },
        limit: 1000,
      });

      let conversationsCreated = 0;
      let skipped = 0;
      const results: any[] = [];

      for (const product of soldProducts.docs) {
        try {
          const existingMessages = await payload.find({
            collection: 'messages',
            where: {
              product: {
                equals: product.id,
              },
            },
            limit: 1,
          });

          const conversationExists = existingMessages.docs && existingMessages.docs.length > 0;

          const bids = await payload.find({
            collection: 'bids',
            where: {
              product: {
                equals: product.id,
              },
            },
            sort: '-amount',
            limit: 1,
          });

          if (!bids.docs || bids.docs.length === 0) {
            results.push({ product: product.title, status: 'skipped', reason: 'no bids found' });
            skipped++;
            continue;
          }

          const highestBid: any = bids.docs[0];
          const bidderId = typeof highestBid.bidder === 'object' && highestBid.bidder ? highestBid.bidder.id : highestBid.bidder;
          const sellerId = typeof product.seller === 'object' && product.seller ? (product.seller as any).id : product.seller;

          let conversationCreated = false;
          let transactionCreated = false;

          if (!conversationExists) {
            await payload.create({
              collection: 'messages',
              data: {
                product: Number(product.id),
                sender: sellerId,
                receiver: bidderId,
                message: `Congratulations! Your bid has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`,
                read: false,
              },
            });
            conversationCreated = true;
            conversationsCreated++;
          }

          const existingTransaction = await payload.find({
            collection: 'transactions',
            where: {
              product: {
                equals: product.id,
              },
            },
            limit: 1,
          });

          if (!existingTransaction.docs || existingTransaction.docs.length === 0) {
            await payload.create({
              collection: 'transactions',
              data: {
                product: Number(product.id),
                seller: sellerId,
                buyer: bidderId,
                amount: highestBid.amount,
                status: 'pending',
                notes: `Transaction created for "${product.title}" with winning bid of ${highestBid.amount}`,
              },
            });
            transactionCreated = true;
          }

          if (conversationCreated && transactionCreated) {
            results.push({ product: product.title, status: 'created conversation and transaction' });
          } else if (conversationCreated && !transactionCreated) {
            results.push({ product: product.title, status: 'created conversation (transaction exists)' });
          } else if (!conversationCreated && transactionCreated) {
            results.push({ product: product.title, status: 'created transaction (conversation exists)' });
          } else {
            results.push({ product: product.title, status: 'skipped (both exist)' });
            skipped++;
          }
        } catch (error: any) {
          results.push({ product: product.title, status: 'error', error: error.message });
        }
      }

      res.json({
        success: true,
        summary: {
          totalSoldProducts: soldProducts.docs.length,
          conversationsCreated,
          skipped,
        },
        results,
      });
    } catch (error: any) {
      console.error('Error creating conversations:', error);
      Sentry.captureException(error, { tags: { route: '/api/create-conversations' } });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Sync endpoint to update product currentBid with highest bid (admin only)
  router.post('/api/sync-bids', async (req, res) => {
    try {
      const user = await authenticateJWT(req);
      if (!user || (user as any).role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const bids = await payload.find({
        collection: 'bids',
        limit: 1000,
        sort: '-amount',
      });

      const productBids: { [key: string]: number } = {};

      for (const bid of bids.docs) {
        const productId = typeof bid.product === 'string' ? bid.product : (bid.product as any).id;
        const amount = bid.amount as number;

        if (!productBids[productId] || amount > productBids[productId]) {
          productBids[productId] = amount;
        }
      }

      const updates = [];
      for (const [productId, highestBid] of Object.entries(productBids)) {
        try {
          await payload.update({
            collection: 'products',
            id: productId,
            data: {
              currentBid: highestBid,
            },
          });
          updates.push({ productId, highestBid });
        } catch (error: any) {
          console.error(`Error updating product ${productId}:`, error.message);
        }
      }

      res.json({
        success: true,
        message: `Updated ${updates.length} products`,
        updates,
      });
    } catch (error: any) {
      console.error('Error syncing bids:', error);
      Sentry.captureException(error, { tags: { route: '/api/sync-bids' } });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Report product endpoint
  router.post('/api/reports', reportLimiter, requireAuth, validate(reportCreateSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { productId, reason, description } = req.body;

      const product = await payload.findByID({
        collection: 'products',
        id: productId,
        overrideAccess: true,
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      if (!product.active) {
        return res.status(400).json({ error: 'This product is already hidden' });
      }

      const existing = await payload.find({
        collection: 'reports',
        where: {
          and: [
            { reporter: { equals: userId } },
            { product: { equals: productId } },
          ],
        },
        limit: 1,
        overrideAccess: true,
      });

      if (existing.docs.length > 0) {
        return res.status(409).json({ error: 'You have already reported this product' });
      }

      const report = await payload.create({
        collection: 'reports',
        data: {
          product: productId,
          reporter: userId,
          reason,
          description: description || undefined,
          status: 'pending',
        } as any,
        overrideAccess: true,
      });

      res.json({ success: true, reportId: report.id });
    } catch (error: any) {
      console.error('Error creating report:', error);
      Sentry.captureException(error, { tags: { route: '/api/reports' } });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
