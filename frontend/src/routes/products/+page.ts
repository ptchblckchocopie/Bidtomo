import { fetchProducts } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '12');
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || 'active';

  const data = await fetchProducts({
    page,
    limit,
    search: search || undefined,
    status
  });

  return {
    products: data.docs,
    totalDocs: data.totalDocs,
    totalPages: data.totalPages,
    currentPage: data.page,
    limit: data.limit,
    search,
    status
  };
};
