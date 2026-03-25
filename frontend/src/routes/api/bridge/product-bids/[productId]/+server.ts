import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/product-bids/:productId - Fetch bids via custom SQL endpoint
export const GET: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);

    const response = await cmsRequest(`/api/product-bids/${params.productId}`, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge product-bids GET error:', error);
    return errorResponse(error.message);
  }
};
