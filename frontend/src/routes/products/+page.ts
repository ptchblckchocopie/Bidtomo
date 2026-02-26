import { fetchProducts, fetchMyBidsProducts, searchUsers, getCurrentUser } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, fetch }) => {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '12');
  const search = url.searchParams.get('search') || '';
  let status = url.searchParams.get('status') || 'active';
  const region = url.searchParams.get('region') || '';
  const city = url.searchParams.get('city') || '';
  const searchType = url.searchParams.get('searchType') || 'products';

  // Only admins can view hidden products — silently fall back to active
  if (status === 'hidden') {
    const currentUser = await getCurrentUser(fetch);
    if (!currentUser || currentUser.role !== 'admin') {
      status = 'active';
    }
  }

  // User search mode
  if (searchType === 'users') {
    const userData = await searchUsers({
      search: search || undefined,
      page,
      limit,
      customFetch: fetch,
    });

    return {
      products: [],
      users: userData.docs,
      totalDocs: userData.totalDocs,
      totalPages: userData.totalPages,
      currentPage: userData.page,
      limit: userData.limit,
      search,
      status,
      region,
      city,
      searchType,
    };
  }

  // Product search mode (default)
  let data;

  if (status === 'my-bids') {
    data = await fetchMyBidsProducts({
      page,
      limit,
      search: search || undefined,
      customFetch: fetch
    });
  } else if (status === 'hidden') {
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
    users: [],
    totalDocs: data.totalDocs,
    totalPages: data.totalPages,
    currentPage: data.page,
    limit: data.limit,
    search,
    status,
    region,
    city,
    searchType,
  };
};
