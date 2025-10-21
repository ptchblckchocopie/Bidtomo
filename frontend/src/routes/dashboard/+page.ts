import { fetchProductsBySeller, getCurrentUser } from '$lib/api';
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async () => {
  // Check if user is logged in
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    // Redirect to login if not authenticated
    throw redirect(302, '/login?redirect=/dashboard');
  }

  // Fetch products for this seller
  const products = await fetchProductsBySeller(currentUser.id);

  return {
    user: currentUser,
    products,
  };
};
