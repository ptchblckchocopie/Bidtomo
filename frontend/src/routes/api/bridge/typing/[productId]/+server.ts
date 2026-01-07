import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/typing/[productId] - Get typing status
export const GET: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest(`/api/typing/${params.productId}`, {
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge typing GET error:', error);
    return errorResponse(error.message);
  }
};
