import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse, sanitizeQueryParams } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/products - List products
export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const params = sanitizeQueryParams(url.searchParams);

    // Forward auth token so CMS can evaluate access control (admins see hidden products)
    const token = getTokenFromRequest(request);
    const response = await cmsRequest(`/api/products?${params.toString()}`, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge products GET error:', error);
    return errorResponse(error.message);
  }
};

// POST /api/bridge/products - Create product
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest('/api/products', {
      method: 'POST',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge products POST error:', error);
    return errorResponse(error.message);
  }
};
