import { fetchProduct, fetchProductBids } from '$lib/api';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params }) => {
  const product = await fetchProduct(params.id);

  if (!product) {
    throw error(404, 'Product not found');
  }

  const bids = await fetchProductBids(params.id);

  return {
    product,
    bids,
  };
};
