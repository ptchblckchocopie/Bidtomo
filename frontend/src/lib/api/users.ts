import { BRIDGE_URL, getAuthHeaders } from './_shared';
import type { Product, PublicUserProfile, UserLimits } from './types';

export async function searchUsers(params?: {
  search?: string;
  page?: number;
  limit?: number;
  customFetch?: typeof fetch;
}): Promise<{ docs: PublicUserProfile[]; totalDocs: number; totalPages: number; page: number; limit: number }> {
  const empty = { docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: params?.limit || 12 };
  try {
    const fetchFn = params?.customFetch || fetch;
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));

    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/users/search?${queryParams.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) return empty;
    return await response.json();
  } catch (error) {
    console.error('Error searching users:', error);
    return empty;
  }
}

export async function fetchUserProfile(userId: string): Promise<PublicUserProfile | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/${userId}?depth=1`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

export async function fetchUserProducts(
  userId: string,
  params?: {
    status?: 'available' | 'sold' | 'ended';
    active?: boolean;
    limit?: number;
    page?: number;
  }
): Promise<{ docs: Product[]; totalDocs: number; totalPages: number }> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.status) {
      queryParams.append('where[status][equals]', params.status);
    }
    if (params?.active !== undefined) {
      queryParams.append('where[active][equals]', String(params.active));
    }
    if (params?.limit) {
      queryParams.append('limit', String(params.limit));
    }
    if (params?.page) {
      queryParams.append('page', String(params.page));
    }

    queryParams.append('sort', '-createdAt');

    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/users/${userId}/products?${queryParams.toString()}`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user products');
    }

    const data = await response.json();
    return {
      docs: data.docs || [],
      totalDocs: data.totalDocs || 0,
      totalPages: data.totalPages || 0,
    };
  } catch (error) {
    console.error('Error fetching user products:', error);
    return { docs: [], totalDocs: 0, totalPages: 0 };
  }
}

export async function getUserLimits(): Promise<UserLimits | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/limits`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user limits');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user limits:', error);
    return null;
  }
}
