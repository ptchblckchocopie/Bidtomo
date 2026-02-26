import { getCurrentUser } from '$lib/api';
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ fetch }) => {
  const currentUser = await getCurrentUser(fetch);

  if (!currentUser) {
    throw redirect(302, '/login?redirect=/sell');
  }

  return { user: currentUser };
};
