import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/bid/accept - Accept highest bid
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest('/api/bid/accept', {
      method: 'POST',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge bid accept error:', error);
    return errorResponse(error.message);
  }
};
