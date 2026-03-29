import { BRIDGE_URL, getAuthHeaders, extractErrorMessage } from './_shared';
import type { Rating, UserRatingStats } from './types';

export async function createRating(
  transactionId: string,
  rating: number,
  comment?: string
): Promise<Rating | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/ratings`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        transaction: transactionId,
        rating,
        comment,
      }),
    });

    if (!response.ok) {
      const msg = await extractErrorMessage(response, 'Failed to create rating');
      throw new Error(msg);
    }

    const data = await response.json();
    return data.doc || data;
  } catch (error) {
    console.error('Error creating rating:', error);
    throw error;
  }
}

export async function addRatingFollowUp(
  ratingId: string,
  followUpRating: number,
  followUpComment?: string
): Promise<Rating | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/ratings/${ratingId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        followUp: {
          rating: followUpRating,
          comment: followUpComment,
        },
      }),
    });

    if (!response.ok) {
      const msg = await extractErrorMessage(response, 'Failed to add follow-up');
      throw new Error(msg);
    }

    const data = await response.json();
    return data.doc || data;
  } catch (error) {
    console.error('Error adding follow-up:', error);
    throw error;
  }
}

export async function fetchUserRatings(
  userId: string,
  type: 'received' | 'given' = 'received'
): Promise<Rating[]> {
  try {
    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/users/${userId}/ratings?type=${type}&depth=3`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user ratings');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching user ratings:', error);
    return [];
  }
}

export function calculateUserRatingStats(ratings: Rating[]): UserRatingStats {
  const sellerRatings = ratings.filter(r => r.raterRole === 'buyer');
  const buyerRatings = ratings.filter(r => r.raterRole === 'seller');

  const calcAverage = (ratingsList: Rating[]) => {
    if (ratingsList.length === 0) return 0;
    const sum = ratingsList.reduce((acc, r) => acc + r.rating, 0);
    return sum / ratingsList.length;
  };

  return {
    averageRating: calcAverage(ratings),
    totalRatings: ratings.length,
    asSeller: {
      averageRating: calcAverage(sellerRatings),
      totalRatings: sellerRatings.length,
    },
    asBuyer: {
      averageRating: calcAverage(buyerRatings),
      totalRatings: buyerRatings.length,
    },
  };
}

export async function fetchMyRatingForTransaction(transactionId: string): Promise<Rating | null> {
  try {
    const { getCurrentUser } = await import('./auth');
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;

    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/ratings?where[transaction][equals]=${transactionId}&where[rater][equals]=${currentUser.id}&depth=1`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch rating');
    }

    const data = await response.json();
    return data.docs?.[0] || null;
  } catch (error) {
    console.error('Error fetching rating:', error);
    return null;
  }
}
