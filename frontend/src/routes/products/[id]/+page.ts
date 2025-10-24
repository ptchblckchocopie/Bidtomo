import { fetchProduct, fetchProductBids } from '$lib/api';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
  const product = await fetchProduct(params.id, fetch);

  if (!product) {
    throw error(404, 'Product not found');
  }

  const bids = await fetchProductBids(params.id, fetch);

  return {
    product,
    bids,
  };
};
