import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/bid/auto/:productId - Get user's auto-bid for a product
export const GET: RequestHandler = async ({ request, params, cookies }) => {
  try {
    const token = getTokenFromRequest(request, cookies);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest(`/api/bid/auto/${params.productId}`, {
      method: 'GET',
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge auto-bid get error:', error);
    return errorResponse(error.message);
  }
};
