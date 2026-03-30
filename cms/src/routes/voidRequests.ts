import { Router } from 'express';
import * as Sentry from '@sentry/node';
import type { Payload } from 'payload';
import { requireAuth } from '../middleware/requireAuth';
import { validate, voidRequestCreateSchema, voidRequestRespondSchema, voidRequestSellerChoiceSchema, voidRequestSecondBidderSchema } from '../middleware/validate';
import { publishProductUpdate, publishMessageNotification } from '../redis';
import { queueEmail, sendVoidRequestEmail, sendVoidResponseEmail, sendAuctionRestartedEmail, sendSecondBidderOfferEmail } from '../services/emailService';

interface VoidRequestsDeps {
  payload: Payload;
  isProduction: boolean;
}

export function createVoidRequestsRouter({ payload, isProduction }: VoidRequestsDeps): Router {
  const router = Router();

  // Create void request
  router.post('/api/void-request/create', requireAuth, validate(voidRequestCreateSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { transactionId, reason } = req.body;

      const transaction: any = await payload.findByID({
        collection: 'transactions',
        id: transactionId,
        depth: 1,
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const buyerId = typeof transaction.buyer === 'object' ? transaction.buyer.id : transaction.buyer;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;
      const productId = typeof transaction.product === 'object' ? transaction.product.id : transaction.product;

      if (userId !== buyerId && userId !== sellerId) {
        return res.status(403).json({ error: 'Only buyer or seller can create void request' });
      }

      if (!['pending', 'in_progress'].includes(transaction.status)) {
        return res.status(400).json({ error: `Cannot void transaction with status: ${transaction.status}` });
      }

      // Cooldown: reject void requests on transactions created less than 1 hour ago
      const transactionCreatedAt = new Date(transaction.createdAt).getTime();
      const oneHourMs = 60 * 60 * 1000;
      if (Date.now() - transactionCreatedAt < oneHourMs) {
        return res.status(400).json({
          error: 'Void requests can only be submitted at least 1 hour after the transaction was created',
        });
      }

      // Check if there's already a pending void request
      const existingRequests = await payload.find({
        collection: 'void-requests',
        where: {
          transaction: { equals: transactionId },
          status: { equals: 'pending' },
        },
        limit: 1,
      });

      if (existingRequests.docs.length > 0) {
        return res.status(400).json({ error: 'There is already a pending void request for this transaction' });
      }

      // Rate limit: prevent spam
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentUserRequests = await payload.find({
        collection: 'void-requests',
        where: {
          initiator: { equals: userId },
          createdAt: { greater_than: oneDayAgo },
        },
        limit: 0,
      });

      if (recentUserRequests.totalDocs >= 5) {
        return res.status(429).json({ error: 'Too many void requests. Please try again later.' });
      }

      const initiatorRole = userId === sellerId ? 'seller' : 'buyer';

      const voidRequest = await payload.create({
        collection: 'void-requests',
        data: {
          transaction: transactionId,
          product: productId,
          initiator: userId,
          initiatorRole,
          reason,
          status: 'pending',
        },
      });

      const initiator: any = await payload.findByID({ collection: 'users', id: userId });
      const product: any = await payload.findByID({ collection: 'products', id: productId });
      const otherPartyId = userId === sellerId ? buyerId : sellerId;
      const otherParty: any = await payload.findByID({ collection: 'users', id: otherPartyId });

      publishMessageNotification(otherPartyId, {
        type: 'void_request',
        messageId: voidRequest.id,
        productId,
        senderId: userId,
        preview: `Void request for ${product.title}`,
      });

      if (otherParty?.email) {
        await sendVoidRequestEmail({
          to: otherParty.email,
          productTitle: product.title,
          initiatorName: initiator.name,
          reason,
          isInitiator: false,
          productId,
          voidRequestId: voidRequest.id as number,
        });
      }

      const trackEvent = (global as any).trackEvent;
      if (trackEvent) trackEvent('void_request_created', userId, { productId, transactionId, voidRequestId: voidRequest.id });

      res.json({
        success: true,
        voidRequestId: voidRequest.id,
        message: 'Void request created successfully',
      });
    } catch (error: any) {
      console.error('Error creating void request:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/void-request/create');
        Sentry.captureException(error);
      });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Respond to void request (approve/reject)
  router.post('/api/void-request/respond', requireAuth, validate(voidRequestRespondSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { voidRequestId, action, rejectionReason } = req.body;

      const voidRequest: any = await payload.findByID({
        collection: 'void-requests',
        id: voidRequestId,
        depth: 2,
      });

      if (!voidRequest) {
        return res.status(404).json({ error: 'Void request not found' });
      }

      if (voidRequest.status !== 'pending') {
        return res.status(400).json({ error: `Void request is already ${voidRequest.status}` });
      }

      const transaction = voidRequest.transaction;
      const buyerId = typeof transaction.buyer === 'object' ? transaction.buyer.id : transaction.buyer;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;
      const initiatorId = typeof voidRequest.initiator === 'object' ? voidRequest.initiator.id : voidRequest.initiator;

      if (userId === initiatorId) {
        return res.status(403).json({ error: 'Cannot respond to your own void request' });
      }

      if (userId !== buyerId && userId !== sellerId) {
        return res.status(403).json({ error: 'Only buyer or seller can respond to void request' });
      }

      const productId = typeof voidRequest.product === 'object' ? voidRequest.product.id : voidRequest.product;
      const product: any = await payload.findByID({ collection: 'products', id: productId });
      const initiator: any = await payload.findByID({ collection: 'users', id: initiatorId });

      if (action === 'approve') {
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            status: 'approved',
            approvedAt: new Date().toISOString(),
          },
        });

        await payload.update({
          collection: 'transactions',
          id: transaction.id,
          data: {
            status: 'voided',
            voidRequest: voidRequestId,
          },
        });

        publishMessageNotification(initiatorId, {
          type: 'void_approved',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `Void request approved for ${product.title}`,
        });

        if (initiator?.email) {
          await sendVoidResponseEmail({
            to: initiator.email,
            productTitle: product.title,
            approved: true,
            productId,
            voidRequestId,
          });
        }

        const isSeller = userId === sellerId;

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('void_request_responded', userId, { voidRequestId, action: 'approve', productId });

        res.json({
          success: true,
          message: 'Void request approved',
          requiresSellerChoice: true,
          isSeller,
          voidRequestId,
        });
      } else {
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            status: 'rejected',
            rejectionReason: rejectionReason || 'No reason provided',
          },
        });

        publishMessageNotification(initiatorId, {
          type: 'void_rejected',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `Void request rejected for ${product.title}`,
        });

        if (initiator?.email) {
          await sendVoidResponseEmail({
            to: initiator.email,
            productTitle: product.title,
            approved: false,
            rejectionReason,
            productId,
            voidRequestId,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('void_request_responded', userId, { voidRequestId, action: 'reject', productId });

        res.json({
          success: true,
          message: 'Void request rejected',
        });
      }
    } catch (error: any) {
      console.error('Error responding to void request:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/void-request/respond');
        Sentry.captureException(error);
      });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Seller choice after void approval
  router.post('/api/void-request/seller-choice', requireAuth, validate(voidRequestSellerChoiceSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { voidRequestId, choice } = req.body;

      const voidRequest: any = await payload.findByID({
        collection: 'void-requests',
        id: voidRequestId,
        depth: 2,
      });

      if (!voidRequest) {
        return res.status(404).json({ error: 'Void request not found' });
      }

      if (voidRequest.status !== 'approved') {
        return res.status(400).json({ error: 'Void request must be approved first' });
      }

      if (voidRequest.sellerChoice) {
        return res.status(400).json({ error: 'Seller choice already made' });
      }

      const transaction = voidRequest.transaction;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;

      if (userId !== sellerId) {
        return res.status(403).json({ error: 'Only seller can make this choice' });
      }

      const productId = typeof voidRequest.product === 'object' ? voidRequest.product.id : voidRequest.product;
      const product: any = await payload.findByID({ collection: 'products', id: productId, depth: 1 });
      const seller: any = await payload.findByID({ collection: 'users', id: sellerId });

      if (choice === 'restart_bidding') {
        const newEndDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await payload.update({
          collection: 'products',
          id: productId,
          data: {
            status: 'available',
            auctionEndDate: newEndDate,
          },
        });

        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            sellerChoice: 'restart_bidding',
          },
        });

        const bids = await payload.find({
          collection: 'bids',
          where: { product: { equals: productId } },
          depth: 1,
        });

        const notifiedBidders = new Set<number>();
        for (const bid of bids.docs) {
          const bidderId = typeof (bid as any).bidder === 'object' ? (bid as any).bidder.id : (bid as any).bidder;
          if (notifiedBidders.has(bidderId)) continue;
          notifiedBidders.add(bidderId);

          const bidder: any = await payload.findByID({ collection: 'users', id: bidderId });

          publishMessageNotification(bidderId, {
            type: 'auction_restarted',
            messageId: voidRequestId,
            productId,
            senderId: sellerId,
            preview: `Bidding reopened for ${product.title}`,
          });

          if (bidder?.email) {
            await sendAuctionRestartedEmail({
              to: bidder.email,
              productTitle: product.title,
              productId,
              newEndDate,
            });
          }
        }

        publishProductUpdate(productId, {
          type: 'status_change',
          status: 'available',
          auctionEndDate: newEndDate,
        });

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('seller_choice_made', userId, { voidRequestId, choice: 'restart_bidding', productId });

        res.json({
          success: true,
          message: 'Auction restarted successfully',
          newEndDate,
          notifiedBidders: notifiedBidders.size,
        });
      } else {
        // Offer to second highest bidder
        const bids = await payload.find({
          collection: 'bids',
          where: { product: { equals: productId } },
          sort: '-amount',
          limit: 2,
          depth: 1,
        });

        if (bids.docs.length < 2) {
          return res.status(400).json({
            error: 'No second bidder available. Please restart the bidding instead.',
            onlyOption: 'restart_bidding',
          });
        }

        const secondBid: any = bids.docs[1];
        const secondBidderId = typeof secondBid.bidder === 'object' ? secondBid.bidder.id : secondBid.bidder;
        const secondBidder: any = await payload.findByID({ collection: 'users', id: secondBidderId });

        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            sellerChoice: 'offer_second_bidder',
            secondBidderOffer: {
              offeredTo: secondBidderId,
              offerAmount: secondBid.amount,
              offerStatus: 'pending',
              offeredAt: new Date().toISOString(),
            },
          },
        });

        // Set 48-hour expiration on the offer (raw SQL — column added by migration)
        try {
          const pool = (payload.db as any).pool;
          await pool.query(
            `UPDATE void_requests SET offer_expires_at = NOW() + interval '48 hours' WHERE id = $1`,
            [voidRequestId]
          );
        } catch (expiryErr) {
          // Non-critical — offer still works, just won't auto-expire
          console.error('Failed to set offer_expires_at:', expiryErr);
        }

        publishMessageNotification(secondBidderId, {
          type: 'second_bidder_offer',
          messageId: voidRequestId,
          productId,
          senderId: sellerId,
          preview: `Offer to purchase ${product.title}`,
        });

        if (secondBidder?.email) {
          await sendSecondBidderOfferEmail({
            to: secondBidder.email,
            productTitle: product.title,
            offerAmount: secondBid.amount,
            currency: seller?.currency || 'PHP',
            productId,
            voidRequestId,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('seller_choice_made', userId, { voidRequestId, choice: 'offer_second_bidder', productId });

        res.json({
          success: true,
          message: 'Offer sent to second highest bidder',
          secondBidder: {
            id: secondBidderId,
            name: secondBidder?.name,
            amount: secondBid.amount,
          },
        });
      }
    } catch (error: any) {
      console.error('Error processing seller choice:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/void-request/seller-choice');
        Sentry.captureException(error);
      });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Second bidder response to offer
  router.post('/api/void-request/second-bidder-response', requireAuth, validate(voidRequestSecondBidderSchema), async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { voidRequestId, action } = req.body;

      const voidRequest: any = await payload.findByID({
        collection: 'void-requests',
        id: voidRequestId,
        depth: 2,
      });

      if (!voidRequest) {
        return res.status(404).json({ error: 'Void request not found' });
      }

      if (voidRequest.sellerChoice !== 'offer_second_bidder') {
        return res.status(400).json({ error: 'No offer available for this void request' });
      }

      if (!voidRequest.secondBidderOffer || voidRequest.secondBidderOffer.offerStatus !== 'pending') {
        return res.status(400).json({ error: 'Offer is not pending' });
      }

      const offeredToId = typeof voidRequest.secondBidderOffer.offeredTo === 'object'
        ? voidRequest.secondBidderOffer.offeredTo.id
        : voidRequest.secondBidderOffer.offeredTo;

      if (userId !== offeredToId) {
        return res.status(403).json({ error: 'Only the offered bidder can respond' });
      }

      const transaction = voidRequest.transaction;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;
      const productId = typeof voidRequest.product === 'object' ? voidRequest.product.id : voidRequest.product;
      const product: any = await payload.findByID({ collection: 'products', id: productId });
      const seller: any = await payload.findByID({ collection: 'users', id: sellerId });
      const buyer: any = await payload.findByID({ collection: 'users', id: userId });

      if (action === 'accept') {
        // Atomically lock the product row and set to sold
        const pool = (payload.db as any).pool;
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const lockedProduct = await client.query(
            `SELECT id, status FROM products WHERE id = $1 FOR UPDATE`,
            [parseInt(productId, 10)]
          );

          if (lockedProduct.rows.length === 0 || lockedProduct.rows[0].status === 'sold') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Product is no longer available' });
          }

          await client.query(
            `UPDATE products SET status = 'sold', updated_at = NOW() WHERE id = $1`,
            [parseInt(productId, 10)]
          );

          await client.query('COMMIT');
        } catch (lockError: any) {
          await client.query('ROLLBACK').catch(() => {});
          console.error('Error locking product for second bidder accept:', lockError);
          Sentry.withScope(scope => {
            if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
            scope.setTag('route', '/api/void-request/second-bidder-response.lock');
            Sentry.captureException(lockError);
          });
          return res.status(500).json({ error: isProduction ? 'Internal server error' : lockError.message });
        } finally {
          client.release();
        }

        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            secondBidderOffer: {
              ...voidRequest.secondBidderOffer,
              offerStatus: 'accepted',
              respondedAt: new Date().toISOString(),
            },
          },
        });

        const newTransaction = await payload.create({
          collection: 'transactions',
          data: {
            product: productId,
            seller: sellerId,
            buyer: userId,
            amount: voidRequest.secondBidderOffer.offerAmount,
            status: 'pending',
            notes: `Transaction created after void - offer to 2nd bidder accepted`,
          },
        });

        const congratsMessage = `Congratulations! Your offer has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`;
        await payload.create({
          collection: 'messages',
          data: {
            product: productId,
            sender: sellerId,
            receiver: userId,
            message: congratsMessage,
            read: false,
          },
        });

        publishMessageNotification(sellerId, {
          type: 'second_bidder_accepted',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `${buyer.name} accepted the offer for ${product.title}`,
        });

        if (buyer?.email) {
          const escH = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          await queueEmail({
            to: buyer.email,
            subject: `Congratulations! You've secured "${product.title}"`,
            html: `
              <h2>Congratulations!</h2>
              <p>Your offer for <strong>${escH(product.title)}</strong> has been accepted.</p>
              <p>Amount: ${escH(String(voidRequest.secondBidderOffer.offerAmount))}</p>
              <p>Please check your inbox to coordinate with the seller.</p>
            `,
          });
        }

        if (seller?.email) {
          const escH = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          await queueEmail({
            to: seller.email,
            subject: `Offer accepted for "${product.title}"`,
            html: `
              <h2>Offer Accepted!</h2>
              <p><strong>${escH(buyer.name)}</strong> has accepted your offer for <strong>${escH(product.title)}</strong>.</p>
              <p>Amount: ${escH(String(voidRequest.secondBidderOffer.offerAmount))}</p>
              <p>Please check your inbox to coordinate the transaction.</p>
            `,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('second_bidder_responded', userId, { voidRequestId, action: 'accept', productId });

        res.json({
          success: true,
          message: 'Offer accepted successfully',
          transactionId: newTransaction.id,
        });
      } else {
        // Decline the offer
        await payload.update({
          collection: 'void-requests',
          id: voidRequestId,
          data: {
            secondBidderOffer: {
              ...voidRequest.secondBidderOffer,
              offerStatus: 'declined',
              respondedAt: new Date().toISOString(),
            },
          },
        });

        publishMessageNotification(sellerId, {
          type: 'second_bidder_declined',
          messageId: voidRequestId,
          productId,
          senderId: userId,
          preview: `${buyer.name} declined the offer for ${product.title}`,
        });

        if (seller?.email) {
          const escH = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          await queueEmail({
            to: seller.email,
            subject: `Offer declined for "${product.title}"`,
            html: `
              <h2>Offer Declined</h2>
              <p><strong>${escH(buyer.name)}</strong> has declined your offer for <strong>${escH(product.title)}</strong>.</p>
              <p>You may want to restart the bidding to find another buyer.</p>
            `,
          });
        }

        const trackEvent = (global as any).trackEvent;
        if (trackEvent) trackEvent('second_bidder_responded', userId, { voidRequestId, action: 'decline', productId });

        res.json({
          success: true,
          message: 'Offer declined',
          suggestRestartBidding: true,
        });
      }
    } catch (error: any) {
      console.error('Error processing second bidder response:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/void-request/second-bidder-response');
        Sentry.captureException(error);
      });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  // Get void request for a transaction
  router.get('/api/void-request/:transactionId', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { transactionId } = req.params;

      const transaction: any = await payload.findByID({
        collection: 'transactions',
        id: parseInt(transactionId, 10),
        depth: 1,
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const buyerId = typeof transaction.buyer === 'object' ? transaction.buyer.id : transaction.buyer;
      const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;

      if (userId !== buyerId && userId !== sellerId) {
        return res.status(403).json({ error: 'You are not authorized to view this void request' });
      }

      const voidRequests = await payload.find({
        collection: 'void-requests',
        where: { transaction: { equals: parseInt(transactionId, 10) } },
        sort: '-createdAt',
        depth: 2,
      });

      res.json({
        success: true,
        voidRequests: voidRequests.docs,
      });
    } catch (error: any) {
      console.error('Error fetching void request:', error);
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
