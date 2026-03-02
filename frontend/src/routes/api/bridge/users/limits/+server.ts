import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/users/limits - Get user bidding/posting limits
export const GET: RequestHandler = async ({ request, cookies }) => {
  try {
    const token = getTokenFromRequest(request, cookies);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest('/api/users/limits', {
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge users limits error:', error);
    return errorResponse(error.message);
  }
};
