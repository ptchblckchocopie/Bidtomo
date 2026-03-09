import { fetchProduct, fetchProductBids, getCurrentUser } from '$lib/api';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
  // Fetch product and bids in parallel
  const [product, bids] = await Promise.all([
    fetchProduct(params.id, fetch),
    fetchProductBids(params.id, fetch),
  ]);

  if (!product) {
    throw error(404, 'Product not found');
  }

  // Block access to hidden products for non-admins and non-sellers
  if (!product.active) {
    const currentUser = await getCurrentUser(fetch);
    const sellerId = typeof product.seller === 'object' ? product.seller?.id : product.seller;
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.id !== sellerId)) {
      throw error(404, 'Product not found');
    }
  }

  return {
    product,
    bids,
  };
};
