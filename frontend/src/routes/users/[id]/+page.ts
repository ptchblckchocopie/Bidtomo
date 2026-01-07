import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { fetchUserProfile, fetchUserProducts, fetchUserRatings, calculateUserRatingStats } from '$lib/api';

export const load: PageLoad = async ({ params, fetch }) => {
  // Fetch user profile
  const user = await fetchUserProfile(params.id);

  if (!user) {
    throw error(404, 'User not found');
  }

  // Fetch user's products (as seller)
  const [activeProducts, soldProducts, ratings] = await Promise.all([
    fetchUserProducts(params.id, { status: 'available', active: true, limit: 12 }),
    fetchUserProducts(params.id, { status: 'sold', limit: 12 }),
    fetchUserRatings(params.id, 'received'),
  ]);

  // Calculate rating stats
  const ratingStats = calculateUserRatingStats(ratings);

  return {
    user,
    activeProducts: activeProducts.docs,
    soldProducts: soldProducts.docs,
    ratings,
    ratingStats,
    totalActiveProducts: activeProducts.totalDocs,
    totalSoldProducts: soldProducts.totalDocs,
  };
};
