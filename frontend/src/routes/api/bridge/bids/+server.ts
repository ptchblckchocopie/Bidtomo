import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse, sanitizeQueryParams } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/bids - List bids
export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    const params = sanitizeQueryParams(url.searchParams);

    const response = await cmsRequest(`/api/bids?${params.toString()}`, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge bids GET error:', error);
    return errorResponse(error.message);
  }
};

// POST /api/bridge/bids - Create bid (uses queue endpoint)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    // Use the bid queue endpoint for safe bid processing
    const response = await cmsRequest('/api/bid/queue', {
      method: 'POST',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge bids POST error:', error);
    return errorResponse(error.message);
  }
};
