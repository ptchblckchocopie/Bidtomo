import { fetchProducts } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  const products = await fetchProducts();

  return {
    products,
  };
};
