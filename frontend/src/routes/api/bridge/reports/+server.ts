import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse, sanitizeQueryParams } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/reports - List reports (admin only)
export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const params = sanitizeQueryParams(url.searchParams);

    const response = await cmsRequest(`/api/reports?${params.toString()}`, {
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge reports GET error:', error);
    return errorResponse(error.message);
  }
};

// POST /api/bridge/reports - Report a product
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const { productId, reason, description } = await request.json();

    const response = await cmsRequest('/api/reports', {
      method: 'POST',
      body: { product: Number(productId), reason, description },
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge reports POST error:', error);
    return errorResponse(error.message);
  }
};
