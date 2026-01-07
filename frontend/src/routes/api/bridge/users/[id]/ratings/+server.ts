import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/users/[id]/ratings - Get ratings for a user
export const GET: RequestHandler = async ({ params, url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    const queryParams = new URLSearchParams();

    // Forward query parameters
    url.searchParams.forEach((value, key) => {
      queryParams.append(key, value);
    });

    // Get type parameter: 'received' (default), 'given', or 'all'
    const type = url.searchParams.get('type') || 'received';
    queryParams.delete('type'); // Remove custom param before forwarding

    // Filter ratings based on type
    if (type === 'received') {
      queryParams.set('where[ratee][equals]', params.id);
    } else if (type === 'given') {
      queryParams.set('where[rater][equals]', params.id);
    }
    // For 'all', we need to do OR query which isn't directly supported,
    // so we'll handle that client-side or make two requests

    // Default depth for related data (need 3 for rating -> transaction -> product -> images)
    if (!queryParams.has('depth')) {
      queryParams.set('depth', '3');
    }

    // Default sort by newest first
    if (!queryParams.has('sort')) {
      queryParams.set('sort', '-createdAt');
    }

    const response = await cmsRequest(`/api/ratings?${queryParams.toString()}`, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge user ratings GET error:', error);
    return errorResponse(error.message);
  }
};
