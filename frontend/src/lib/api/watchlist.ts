import { BRIDGE_URL, getAuthHeaders, handleExpiredToken } from './_shared';

export async function fetchWatchlist(params?: { page?: number; limit?: number }): Promise<{ docs: any[]; totalDocs: number; totalPages: number; page: number }> {
  try {
    const queryParams = new URLSearchParams({
      depth: '1',
      sort: '-createdAt',
    });
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const response = await fetch(`${BRIDGE_URL}/api/bridge/watchlist?${queryParams.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (response.status === 401) {
      handleExpiredToken();
      return { docs: [], totalDocs: 0, totalPages: 0, page: 1 };
    }

    if (!response.ok) {
      return { docs: [], totalDocs: 0, totalPages: 0, page: 1 };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return { docs: [], totalDocs: 0, totalPages: 0, page: 1 };
  }
}

export async function addToWatchlist(productId: string): Promise<{ id: string } | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/watchlist`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ product: Number(productId) }),
    });

    if (response.status === 401) {
      handleExpiredToken();
      return null;
    }

    if (!response.ok) return null;

    const data = await response.json();
    return data.doc || data;
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return null;
  }
}

export async function removeFromWatchlist(watchlistItemId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/watchlist/${watchlistItemId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (response.status === 401) {
      handleExpiredToken();
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return false;
  }
}
