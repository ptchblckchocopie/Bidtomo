import { fetchProducts, fetchMyBidsProducts } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, fetch }) => {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '12');
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'active';
  const region = url.searchParams.get('region') || '';
  const city = url.searchParams.get('city') || '';

  let data;

  if (status === 'my-bids') {
    // Fetch products where the user has placed bids
    data = await fetchMyBidsProducts({
      page,
      limit,
      search: search || undefined,
      customFetch: fetch
    });
  } else if (status === 'hidden') {
    // Fetch hidden products (admin only)
    data = await fetchProducts({
      page,
      limit,
      search: search || undefined,
      status: 'hidden',
      region: region || undefined,
      city: city || undefined,
      customFetch: fetch
    });
  } else {
    // Fetch all products with status filter
    data = await fetchProducts({
      page,
      limit,
      search: search || undefined,
      status,
      region: region || undefined,
      city: city || undefined,
      customFetch: fetch
    });
  }

  return {
    products: data.docs,
    totalDocs: data.totalDocs,
    totalPages: data.totalPages,
    currentPage: data.page,
    limit: data.limit,
    search,
    status,
    region,
    city
  };
};
