import { Router } from 'express';
import * as Sentry from '@sentry/node';
import type { Payload } from 'payload';
import { requireAuth } from '../middleware/requireAuth';
import { validate, profilePictureSchema } from '../middleware/validate';

interface UsersDeps {
  payload: Payload;
  isProduction: boolean;
}

export function createUsersRouter({ payload, isProduction }: UsersDeps): Router {
  const router = Router();

  router.get('/api/users/limits', requireAuth, async (req, res) => {
    try {
      const currentUserId = (req as any).userId;

      const MAX_BIDS = 10;
      const MAX_POSTS = 10;

      // Count active products where user has placed bids
      const userBids = await payload.find({
        collection: 'bids',
        where: {
          bidder: {
            equals: currentUserId,
          },
        },
        limit: 1000,
      });

      // Get unique product IDs from user's bids
      const bidProductIds = new Set<string>();
      userBids.docs.forEach((bid: any) => {
        const productId = typeof bid.product === 'object' ? bid.product.id : bid.product;
        bidProductIds.add(String(productId));
      });

      // Count how many of those products are still active
      let activeBidCount = 0;
      if (bidProductIds.size > 0) {
        const activeProducts = await payload.find({
          collection: 'products',
          where: {
            and: [
              {
                id: {
                  in: Array.from(bidProductIds),
                },
              },
              {
                status: { equals: 'available' },
              },
              {
                active: { equals: true },
              },
            ],
          },
          limit: 1000,
        });
        activeBidCount = activeProducts.totalDocs;
      }

      // Count active products posted by the user
      const userProducts = await payload.find({
        collection: 'products',
        where: {
          and: [
            {
              seller: {
                equals: currentUserId,
              },
            },
            {
              status: { equals: 'available' },
            },
            {
              active: { equals: true },
            },
          ],
        },
        limit: 1000,
      });

      const activePostCount = userProducts.totalDocs;

      const bidsRemaining = Math.max(0, MAX_BIDS - activeBidCount);
      const postsRemaining = Math.max(0, MAX_POSTS - activePostCount);

      res.json({
        bids: {
          current: activeBidCount,
          max: MAX_BIDS,
          remaining: bidsRemaining,
        },
        posts: {
          current: activePostCount,
          max: MAX_POSTS,
          remaining: postsRemaining,
        },
      });
    } catch (error: any) {
      console.error('Error fetching user limits:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/users/limits');
        Sentry.captureException(error);
      });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  router.post('/api/users/profile-picture', requireAuth, validate(profilePictureSchema), async (req, res) => {
    try {
      const currentUserId = (req as any).userId;

      const currentUser = await payload.findByID({
        collection: 'users',
        id: currentUserId as string,
      });

      const oldProfilePictureId = currentUser?.profilePicture
        ? (typeof currentUser.profilePicture === 'object'
          ? (currentUser.profilePicture as any).id
          : currentUser.profilePicture)
        : null;

      const { mediaId } = req.body;

      const updatedUser = await payload.update({
        collection: 'users',
        id: currentUserId as string,
        data: {
          profilePicture: mediaId,
        },
        depth: 1,
        overrideAccess: true,
      });

      // Delete old profile picture from media collection
      if (oldProfilePictureId && String(oldProfilePictureId) !== String(mediaId)) {
        try {
          await payload.delete({
            collection: 'media',
            id: String(oldProfilePictureId),
          });
          console.log(`Deleted old profile picture: ${oldProfilePictureId}`);
        } catch (deleteErr) {
          console.error('Failed to delete old profile picture:', deleteErr);
        }
      }

      const trackEvent = (global as any).trackEvent;
      if (trackEvent) trackEvent('profile_picture_changed', currentUserId, { mediaId });

      res.json({
        success: true,
        user: updatedUser,
      });
    } catch (error: any) {
      console.error('Error updating profile picture:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', '/api/users/profile-picture');
        Sentry.captureException(error);
      });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  router.delete('/api/users/profile-picture', requireAuth, async (req, res) => {
    try {
      const currentUserId = (req as any).userId;

      const currentUser = await payload.findByID({
        collection: 'users',
        id: currentUserId as string,
      });

      const profilePictureId = currentUser?.profilePicture
        ? (typeof currentUser.profilePicture === 'object'
          ? (currentUser.profilePicture as any).id
          : currentUser.profilePicture)
        : null;

      await payload.update({
        collection: 'users',
        id: currentUserId as string,
        data: {
          profilePicture: null as any,
        },
        overrideAccess: true,
      });

      if (profilePictureId) {
        try {
          await payload.delete({
            collection: 'media',
            id: String(profilePictureId),
          });
          console.log(`Deleted profile picture: ${profilePictureId}`);
        } catch (deleteErr) {
          console.error('Failed to delete profile picture media:', deleteErr);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error removing profile picture:', error);
      Sentry.withScope(scope => {
        if ((req as any).userId) scope.setUser({ id: String((req as any).userId) });
        scope.setTag('route', 'DELETE /api/users/profile-picture');
        Sentry.captureException(error);
      });
      res.status(500).json({ error: isProduction ? 'Internal server error' : error.message });
    }
  });

  return router;
}
