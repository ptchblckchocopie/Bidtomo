import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

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
      body: { product: productId, reason, description },
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge reports POST error:', error);
    return errorResponse(error.message);
  }
};
