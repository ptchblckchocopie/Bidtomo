import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/users/[id]/products - Get user's products
export const GET: RequestHandler = async ({ params, url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    const queryParams = new URLSearchParams();

    // Forward query parameters
    url.searchParams.forEach((value, key) => {
      queryParams.append(key, value);
    });

    // Filter products by seller
    queryParams.set('where[seller][equals]', params.id);

    // Default depth for seller info
    if (!queryParams.has('depth')) {
      queryParams.set('depth', '1');
    }

    const response = await cmsRequest(`/api/products?${queryParams.toString()}`, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge user products GET error:', error);
    return errorResponse(error.message);
  }
};
